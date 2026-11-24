/**
 * Backend voor de coachapp. Eén sheet per team, dit script hoort bij die sheet.
 *
 * Twee soorten schrijven, bewust gescheiden:
 * - plan.save vervangt het plan van één wedstrijd, met versiecontrole. Dat doet
 *   normaal één coach vooraf.
 * - gebeurtenis.append voegt één regel toe en controleert geen versie. Daardoor
 *   kunnen meerdere coaches tegelijk registreren zonder elkaar te overschrijven:
 *   niemand schrijft ooit over een regel van een ander heen.
 *
 * Eerste keer: voer setup() uit vanuit de editor.
 */

var SCHEMA = {
  Spelers: ['speler_id', 'naam', 'rugnummer', 'actief'],
  Wedstrijden: [
    'wedstrijd_id',
    'datum',
    'tijd',
    'tegenstander',
    'thuis_uit',
    'team_grootte',
    'status',
    'versie',
    'plan_af',
    'laatst_door',
    'laatst_op',
    'competitieperiode',
  ],
  Aanwezigheid: ['wedstrijd_id', 'speler_id', 'aanwezig'],
  Opstellingen: ['wedstrijd_id', 'periode', 'categorie', 'plek', 'speler_id'],
  Gebeurtenissen: [
    'wedstrijd_id',
    'volgnummer',
    'gebeurtenis_id',
    'periode',
    'tijdstip',
    'type',
    'speler_id',
    'speler_uit',
    'speler_in',
    'coach',
    'omschrijving',
    'verwijdert',
  ],
  Wijzigingslog: [
    'wijziging_id',
    'tijdstip',
    'request_id',
    'actie',
    'wedstrijd_id',
    'coach',
    'samenvatting',
  ],
};

// --- Instellen ---

function setup() {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var toegevoegd = [];

  Object.keys(SCHEMA).forEach(function (naam) {
    var blad = doc.getSheetByName(naam);
    if (!blad) {
      blad = doc.insertSheet(naam);
      blad.getRange(1, 1, 1, SCHEMA[naam].length).setValues([SCHEMA[naam]]);
      toegevoegd.push('tabblad ' + naam);
    } else {
      // Nooit bestaande koppen overschrijven: alleen ontbrekende kolommen
      // achteraan toevoegen. Zo kan setup nooit gegevens onder een verkeerde
      // kop terechtbrengen, hoe vaak je hem ook draait.
      var huidig = koppenVan_(blad);
      SCHEMA[naam].forEach(function (kolom) {
        if (huidig.indexOf(kolom) === -1) {
          blad.getRange(1, huidig.length + 1).setValue(kolom);
          huidig.push(kolom);
          toegevoegd.push(naam + '.' + kolom);
        }
      });
    }
    blad.getRange(1, 1, 1, Math.max(1, blad.getLastColumn())).setFontWeight('bold');
    blad.setFrozenRows(1);
  });

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_TOKEN')) props.setProperty('API_TOKEN', Utilities.getUuid());
  Logger.log('Toegevoegd: ' + (toegevoegd.length ? toegevoegd.join(', ') : 'niets, alles was er al'));
  Logger.log('Token: ' + props.getProperty('API_TOKEN'));
  return props.getProperty('API_TOKEN');
}

/** De koppen zoals ze werkelijk in de sheet staan, in die volgorde. */
function koppenVan_(blad) {
  if (blad.getLastColumn() === 0) return [];
  return blad
    .getRange(1, 1, 1, blad.getLastColumn())
    .getValues()[0]
    .map(String)
    .filter(function (k) {
      return k !== '';
    });
}

/** Zet een object om naar een rij volgens de werkelijke kolomvolgorde van de sheet. */
function naarRij_(koppen, obj) {
  return koppen.map(function (k) {
    return obj[k] === undefined || obj[k] === null ? '' : obj[k];
  });
}

function toonToken() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('API_TOKEN'));
}

// --- Ingang ---

function doGet() {
  return json_({
    ok: true,
    data: { status: 'actief', schemaOk: controleerSchema_().length === 0 },
    versie: 0,
  });
}

function doPost(e) {
  try {
    return json_(verwerk_(JSON.parse(e.postData.contents)));
  } catch (error) {
    return json_(foutmelding_('SERVERFOUT', String((error && error.message) || error)));
  }
}

function verwerk_(verzoek) {
  if (!verzoek || !verzoek.actie || !verzoek.requestId) {
    return foutmelding_('SERVERFOUT', 'Verzoek mist actie of requestId.');
  }

  var token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!token || verzoek.token !== token) {
    return foutmelding_('GEEN_TOEGANG', 'Het token wordt niet geaccepteerd.');
  }

  var ontbreekt = controleerSchema_();
  if (verzoek.actie === 'schema.check') {
    return { ok: true, data: { schemaOk: ontbreekt.length === 0, ontbreekt: ontbreekt }, versie: 0 };
  }
  if (ontbreekt.length) {
    return foutmelding_('SCHEMA', 'Ontbreekt in de sheet: ' + ontbreekt.join(', '));
  }

  // Lezen hoeft niet te wachten op een slot.
  if (verzoek.actie === 'bootstrap.get') return bootstrap_();
  if (verzoek.actie === 'wedstrijd.get') return wedstrijdOphalen_(verzoek.payload.wedstrijdId);
  if (verzoek.actie === 'seizoen.get')
    return seizoenOverzicht_(Number((verzoek.payload || {}).competitieperiode) || 0);
  if (verzoek.actie === 'plan.versie') return planVersie_(verzoek.payload.wedstrijdId);
  if (verzoek.actie === 'gebeurtenissen.since') {
    return sindsVolgnummer_(verzoek.payload.wedstrijdId, Number(verzoek.payload.sinds) || 0);
  }

  var slot = LockService.getDocumentLock();
  if (!slot.tryLock(20000)) {
    return foutmelding_('SERVERFOUT', 'De sheet is bezet, probeer het zo nog eens.');
  }

  try {
    var cache = CacheService.getScriptCache();
    var sleutel = 'req_' + verzoek.requestId;
    var eerder = cache.get(sleutel);
    if (eerder) return JSON.parse(eerder);

    var antwoord;
    if (verzoek.actie === 'spelers.save') antwoord = spelersBewaren_(verzoek.payload.spelers);
    else if (verzoek.actie === 'plan.save')
      antwoord = planBewaren_(verzoek.payload, verzoek.verwachteVersie, verzoek.coach);
    else if (verzoek.actie === 'gebeurtenis.append')
      antwoord = gebeurtenisToevoegen_(verzoek.payload, verzoek.coach);
    else if (verzoek.actie === 'gebeurtenis.remove')
      antwoord = gebeurtenisVerwijderen_(verzoek.payload);
    else if (verzoek.actie === 'wedstrijd.remove')
      antwoord = wedstrijdVerwijderen_(verzoek.payload.wedstrijdId);
    else return foutmelding_('SERVERFOUT', 'Onbekende actie: ' + verzoek.actie);

    if (antwoord.ok) {
      logRegel_(verzoek, antwoord);
      cache.put(sleutel, JSON.stringify(antwoord), 21600);
    }
    return antwoord;
  } finally {
    // Eerst wegschrijven, dan pas het slot vrijgeven. Zonder flush las een
    // gelijktijdig verzoek de sheet van voor deze schrijfactie: dan kregen
    // twee regels hetzelfde volgnummer, of kwam dezelfde gebeurtenis twee keer
    // in de sheet. Een regel met een dubbel volgnummer werd bovendien niet
    // opgehaald door andere trainers.
    SpreadsheetApp.flush();
    slot.releaseLock();
  }
}

/**
 * Elke gebeurtenis één keer, ook als hij door de fout hierboven dubbel in de
 * sheet staat. Houdt de eerste regel aan.
 */
function uniekeGebeurtenissen_(rijen) {
  var gezien = {};
  return rijen.filter(function (r) {
    var id = String(r.gebeurtenis_id);
    if (gezien[id]) return false;
    gezien[id] = true;
    return true;
  });
}

// --- Acties ---

function bootstrap_() {
  var spelers = lees_('Spelers').map(function (r) {
    return {
      id: String(r.speler_id),
      naam: String(r.naam),
      rugnummer: Number(r.rugnummer) || 0,
      actief: r.actief !== false && r.actief !== 'nee' && r.actief !== '',
    };
  });
  var wedstrijden = lees_('Wedstrijden').map(naarWedstrijdRij_);
  return { ok: true, data: { spelers: spelers, wedstrijden: wedstrijden }, versie: 0 };
}

function wedstrijdOphalen_(wedstrijdId) {
  if (!wedstrijdId) return foutmelding_('SERVERFOUT', 'wedstrijdId ontbreekt.');

  var wedstrijden = lees_('Wedstrijden').filter(function (r) {
    return String(r.wedstrijd_id) === String(wedstrijdId);
  });
  var wedstrijd = wedstrijden.length ? naarWedstrijdRij_(wedstrijden[0]) : null;

  var van = function (naam) {
    return lees_(naam).filter(function (r) {
      return String(r.wedstrijd_id) === String(wedstrijdId);
    });
  };

  return {
    ok: true,
    versie: wedstrijd ? wedstrijd.versie : 0,
    data: {
      wedstrijd: wedstrijd,
      aanwezigheid: van('Aanwezigheid').map(function (r) {
        return {
          speler_id: String(r.speler_id),
          aanwezig: r.aanwezig === true || r.aanwezig === 'ja',
        };
      }),
      opstellingen: van('Opstellingen').map(function (r) {
        return {
          periode: Number(r.periode),
          categorie: String(r.categorie),
          plek: String(r.plek),
          speler_id: String(r.speler_id),
        };
      }),
      gebeurtenissen: uniekeGebeurtenissen_(van('Gebeurtenissen')).map(naarGebeurtenisRij_),
    },
  };
}

/**
 * Totalen over alle wedstrijden in deze sheet. Bewust hier berekend en niet in
 * de app: dan hoeft de telefoon niet het hele seizoen aan regels op te halen.
 *
 * Wisselbeurten tellen zowel het erin komen als het eruit gaan, apart zichtbaar.
 * Periodes tellen elke periode waarin een speler op het veld heeft gestaan,
 * ook als hij er tussentijds af ging.
 */
// --- Rekenkern voor seizoenscijfers en analyses ---
//
// Eén plek waar per wedstrijd het werkelijke verloop wordt opgebouwd. Het
// seizoensoverzicht in de app en de analysetabbladen gebruiken allebei deze
// kern, zodat ze nooit verschillende uitkomsten geven.
//
// Hier wordt verwerkt wat de app ook verwerkt:
//  - correcties: een gebeurtenis die later als verwijderd is gemarkeerd telt niet;
//  - doorgaan: een periode die begint met de eindstand van de vorige periode
//    gebruikt die eindstand en niet het plan.

/** Leest alles één keer in, met correcties al verwerkt. */
function laadSeizoen_() {
  var alle = uniekeGebeurtenissen_(lees_('Gebeurtenissen'));
  var weg = {};
  alle.forEach(function (r) {
    if (String(r.type) === 'verwijderd' && r.verwijdert) weg[String(r.verwijdert)] = true;
  });
  var gebeurtenissen = alle
    .filter(function (r) {
      return String(r.type) !== 'verwijderd' && !weg[String(r.gebeurtenis_id)];
    })
    .sort(function (a, b) {
      return (Number(a.volgnummer) || 0) - (Number(b.volgnummer) || 0);
    });

  return {
    wedstrijden: lees_('Wedstrijden').map(naarWedstrijdRij_),
    opstellingen: lees_('Opstellingen'),
    gebeurtenissen: gebeurtenissen,
    aanwezigheid: lees_('Aanwezigheid'),
    spelers: lees_('Spelers'),
  };
}

function groepeer_(rijen) {
  var uit = {};
  rijen.forEach(function (r) {
    var id = String(r.wedstrijd_id);
    (uit[id] = uit[id] || []).push(r);
  });
  return uit;
}

function positieSleutel_(r) {
  return String(r.categorie) === 'Keeper' ? 'keeper' : String(r.categorie) + '-' + String(r.plek);
}

function categorieVan_(sleutel) {
  return sleutel === 'keeper' ? 'Keeper' : String(sleutel).split('-')[0];
}

/**
 * Het verloop van één wedstrijd, per periode:
 *   begin     positie -> speler waarmee de periode begon
 *   gespeeld  spelers die in deze periode op het veld stonden
 *   rollen    speler -> { categorie: true } voor elke linie waarin hij stond
 *   ingevuld  of er voor deze periode iets is vastgelegd
 *   doorgegaan of de periode begon met de eindstand van de vorige
 */
function verloopVan_(opstellingen, gebeurtenissen) {
  var periodes = {};
  var vorigeEind = {};

  for (var p = 1; p <= 4; p++) {
    var plan = {};
    opstellingen.forEach(function (r) {
      if (Number(r.periode) === p && r.speler_id) plan[positieSleutel_(r)] = String(r.speler_id);
    });
    var doorgegaan =
      p > 1 &&
      gebeurtenissen.some(function (g) {
        return String(g.type) === 'overname' && Number(g.periode) === p;
      });

    var begin = {};
    var bron = doorgegaan ? vorigeEind : plan;
    Object.keys(bron).forEach(function (k) {
      begin[k] = bron[k];
    });

    var stand = {};
    var gespeeld = {};
    var rollen = {};
    Object.keys(begin).forEach(function (k) {
      stand[k] = begin[k];
      gespeeld[begin[k]] = true;
      (rollen[begin[k]] = rollen[begin[k]] || {})[categorieVan_(k)] = true;
    });

    // Wissels en plekruilen in volgorde. Een plekruil ('positie') is geen
    // wissel: hij telt niet als wisselbeurt, maar verandert wel wie in welke
    // linie staat.
    gebeurtenissen.forEach(function (g) {
      var type = String(g.type);
      if ((type !== 'wissel' && type !== 'positie') || Number(g.periode) !== p) return;
      var uit = String(g.speler_uit || '');
      var erin = String(g.speler_in || '');
      if (!uit || !erin) return;
      var plek = null;
      var andere = null;
      Object.keys(stand).forEach(function (k) {
        if (stand[k] === uit) plek = k;
        if (stand[k] === erin) andere = k;
      });
      if (!plek) return;
      if (type === 'positie') {
        if (!andere) return;
        stand[plek] = erin;
        stand[andere] = uit;
        (rollen[erin] = rollen[erin] || {})[categorieVan_(plek)] = true;
        (rollen[uit] = rollen[uit] || {})[categorieVan_(andere)] = true;
        return;
      }
      stand[plek] = erin;
      gespeeld[uit] = true;
      gespeeld[erin] = true;
      (rollen[erin] = rollen[erin] || {})[categorieVan_(plek)] = true;
    });

    periodes[p] = {
      begin: begin,
      gespeeld: gespeeld,
      rollen: rollen,
      ingevuld: Object.keys(begin).length > 0,
      doorgegaan: doorgegaan,
    };
    vorigeEind = stand;
  }
  return periodes;
}

function inCompetitieperiode_(w, competitieperiode) {
  return !competitieperiode || w.competitieperiode === competitieperiode;
}

/**
 * Seizoenscijfers per speler en het doelpuntenverloop. Met een
 * competitieperiode (1 tot en met 4) telt alleen die periode mee, met 0 alles.
 * Het overzicht per competitieperiode wordt altijd over alle wedstrijden
 * berekend, zodat je de periodes naast elkaar kunt zetten.
 */
function seizoenOverzicht_(competitieperiode) {
  var data = laadSeizoen_();
  var opstPer = groepeer_(data.opstellingen);
  var gebPer = groepeer_(data.gebeurtenissen);
  var aanwPer = groepeer_(data.aanwezigheid);

  // Overzicht per competitieperiode, over alle gespeelde wedstrijden.
  var perCompetitieperiode = [1, 2, 3, 4].map(function (cp) {
    return { competitieperiode: cp, wedstrijden: 0, gewonnen: 0, gelijk: 0, verloren: 0, voor: 0, tegen: 0 };
  });
  data.wedstrijden.forEach(function (w) {
    if (String(w.status) !== 'afgerond') return;
    var rij = perCompetitieperiode[w.competitieperiode - 1];
    var voor = 0;
    var tegen = 0;
    (gebPer[w.wedstrijd_id] || []).forEach(function (g) {
      if (String(g.type) === 'doelpunt_voor') voor++;
      if (String(g.type) === 'doelpunt_tegen') tegen++;
    });
    rij.wedstrijden++;
    rij.voor += voor;
    rij.tegen += tegen;
    if (voor > tegen) rij.gewonnen++;
    else if (voor < tegen) rij.verloren++;
    else rij.gelijk++;
  });

  var wedstrijden = data.wedstrijden.filter(function (w) {
    return inCompetitieperiode_(w, competitieperiode);
  });

  var per = {};
  function zorg(id) {
    if (!per[id]) {
      per[id] = {
        speler_id: id,
        naam: id,
        rugnummer: 0,
        wedstrijden: 0,
        periodes: 0,
        periodes_bank: 0,
        wissels_in: 0,
        wissels_uit: 0,
        wissels_totaal: 0,
        doelpunten: 0,
      };
    }
    return per[id];
  }
  data.spelers.forEach(function (s) {
    var id = String(s.speler_id);
    if (!id) return;
    var r = zorg(id);
    r.naam = String(s.naam);
    r.rugnummer = Number(s.rugnummer) || 0;
  });

  var perPeriode = [1, 2, 3, 4].map(function (p) {
    return { periode: p, voor: 0, tegen: 0 };
  });
  var verloop = [];

  wedstrijden.forEach(function (w) {
    var id = w.wedstrijd_id;
    var geb = gebPer[id] || [];
    var verl = verloopVan_(opstPer[id] || [], geb);
    var ingevuld = [1, 2, 3, 4].filter(function (p) {
      return verl[p].ingevuld;
    }).length;

    var gespeeldIn = {};
    [1, 2, 3, 4].forEach(function (p) {
      Object.keys(verl[p].gespeeld).forEach(function (sp) {
        gespeeldIn[sp] = (gespeeldIn[sp] || 0) + 1;
      });
    });
    Object.keys(gespeeldIn).forEach(function (sp) {
      var r = zorg(sp);
      r.wedstrijden++;
      r.periodes += gespeeldIn[sp];
    });

    (aanwPer[id] || []).forEach(function (a) {
      if (!(String(a.aanwezig) === 'ja' || a.aanwezig === true)) return;
      var sp = String(a.speler_id);
      zorg(sp).periodes_bank += Math.max(0, ingevuld - (gespeeldIn[sp] || 0));
    });

    var periodesScore = [0, 0, 0, 0, 0, 0, 0, 0];
    var voor = 0;
    var tegen = 0;
    geb.forEach(function (g) {
      var type = String(g.type);
      var p = Number(g.periode);
      if (type === 'wissel') {
        if (g.speler_uit) zorg(String(g.speler_uit)).wissels_uit++;
        if (g.speler_in) zorg(String(g.speler_in)).wissels_in++;
      } else if (type === 'doelpunt_voor' || type === 'doelpunt_tegen') {
        var isVoor = type === 'doelpunt_voor';
        if (isVoor) voor++;
        else tegen++;
        if (isVoor && g.speler_id) zorg(String(g.speler_id)).doelpunten++;
        if (p >= 1 && p <= 4) {
          if (isVoor) perPeriode[p - 1].voor++;
          else perPeriode[p - 1].tegen++;
          periodesScore[(p - 1) * 2 + (isVoor ? 0 : 1)]++;
        }
      }
    });

    if (String(w.status) === 'afgerond') {
      verloop.push({
        wedstrijd_id: id,
        datum: w.datum,
        tegenstander: w.tegenstander,
        thuis: w.thuis_uit !== 'uit',
        competitieperiode: w.competitieperiode,
        voor: voor,
        tegen: tegen,
        periodes: periodesScore,
      });
    }
  });

  verloop.sort(function (a, b) {
    return String(a.datum).localeCompare(String(b.datum));
  });

  var rijen = Object.keys(per).map(function (id) {
    var r = per[id];
    r.wissels_totaal = r.wissels_in + r.wissels_uit;
    return r;
  });

  return {
    ok: true,
    versie: 0,
    data: {
      competitieperiode: competitieperiode || 0,
      spelers: rijen,
      wedstrijden: wedstrijden.length,
      perPeriode: perPeriode,
      verloop: verloop,
      perCompetitieperiode: perCompetitieperiode,
    },
  };
}

/**
 * Alleen het versienummer en wie er als laatste opsloeg. Bewust licht: dit
 * wordt regelmatig opgevraagd om te zien of een andere trainer iets heeft
 * gewijzigd, en dan wil je niet de hele wedstrijd ophalen.
 */
function planVersie_(wedstrijdId) {
  var gevonden = null;
  lees_('Wedstrijden').forEach(function (r) {
    if (String(r.wedstrijd_id) === String(wedstrijdId)) gevonden = r;
  });
  if (!gevonden) return { ok: true, versie: 0, data: { versie: 0, planAf: false, door: '', op: '' } };
  return {
    ok: true,
    versie: Number(gevonden.versie) || 0,
    data: {
      versie: Number(gevonden.versie) || 0,
      planAf: String(gevonden.plan_af || '') === 'ja',
      door: String(gevonden.laatst_door || ''),
      op: String(gevonden.laatst_op || ''),
    },
  };
}

/** Alleen wat er sinds het opgegeven volgnummer bij is gekomen. */
function sindsVolgnummer_(wedstrijdId, sinds) {
  var rijen = uniekeGebeurtenissen_(lees_('Gebeurtenissen')).filter(function (r) {
    return String(r.wedstrijd_id) === String(wedstrijdId) && Number(r.volgnummer) > sinds;
  });
  var hoogste = sinds;
  rijen.forEach(function (r) {
    hoogste = Math.max(hoogste, Number(r.volgnummer) || 0);
  });
  var plan = planVersie_(wedstrijdId);
  return {
    ok: true,
    versie: plan.data.versie,
    data: {
      gebeurtenissen: rijen.map(naarGebeurtenisRij_),
      hoogste: hoogste,
      plan: plan.data,
    },
  };
}

/**
 * Voegt één regel toe. Het volgnummer wordt hier toegekend, dus twee coaches
 * die tegelijk registreren krijgen een eenduidige volgorde. Dezelfde
 * gebeurtenis_id twee keer aanbieden levert geen dubbele regel op.
 */
function gebeurtenisToevoegen_(payload, coach) {
  var id = payload && payload.wedstrijdId;
  var g = payload && payload.gebeurtenis;
  if (!id || !g || !g.gebeurtenis_id) {
    return foutmelding_('SERVERFOUT', 'wedstrijdId of gebeurtenis ontbreekt.');
  }

  var bestaande = lees_('Gebeurtenissen');
  var hoogste = 0;
  var alAanwezig = null;
  bestaande.forEach(function (r) {
    hoogste = Math.max(hoogste, Number(r.volgnummer) || 0);
    if (String(r.gebeurtenis_id) === String(g.gebeurtenis_id)) alAanwezig = r;
  });

  if (alAanwezig) {
    return { ok: true, data: { volgnummer: Number(alAanwezig.volgnummer) }, versie: 0 };
  }

  var volgnummer = hoogste + 1;
  var blad = blad_('Gebeurtenissen');
  var koppen = koppenVan_(blad);
  var rij = {
    wedstrijd_id: id,
    volgnummer: volgnummer,
    gebeurtenis_id: g.gebeurtenis_id,
    periode: g.periode,
    tijdstip: g.tijdstip,
    type: g.type,
    speler_id: g.speler_id || '',
    speler_uit: g.speler_uit || '',
    speler_in: g.speler_in || '',
    coach: g.coach || coach || '',
    omschrijving: g.omschrijving || '',
    verwijdert: g.verwijdert || '',
  };
  blad.appendRow(naarRij_(koppen, rij));

  return { ok: true, data: { volgnummer: volgnummer }, versie: 0 };
}

function gebeurtenisVerwijderen_(payload) {
  var blad = blad_('Gebeurtenissen');
  var koppen = SCHEMA.Gebeurtenissen;
  var kolom = koppen.indexOf('gebeurtenis_id') + 1;
  if (blad.getLastRow() < 2) return { ok: true, data: { verwijderd: 0 }, versie: 0 };

  var waarden = blad.getRange(2, kolom, blad.getLastRow() - 1, 1).getValues();
  var verwijderd = 0;
  for (var i = waarden.length - 1; i >= 0; i--) {
    if (String(waarden[i][0]) === String(payload.gebeurtenisId)) {
      blad.deleteRow(i + 2);
      verwijderd++;
    }
  }
  return { ok: true, data: { verwijderd: verwijderd }, versie: 0 };
}

/**
 * Verwijdert een geplande wedstrijd, bijvoorbeeld als de KNVB een tegenstander
 * uit de competitie haalt. Weigert als er al iets is geregistreerd: gespeelde
 * gegevens gooi je niet weg met een knop.
 */
function wedstrijdVerwijderen_(wedstrijdId) {
  if (!wedstrijdId) return foutmelding_('SERVERFOUT', 'wedstrijdId ontbreekt.');

  var heeftGebeurtenissen = lees_('Gebeurtenissen').some(function (r) {
    return String(r.wedstrijd_id) === String(wedstrijdId);
  });
  if (heeftGebeurtenissen) {
    return foutmelding_(
      'SERVERFOUT',
      'Deze wedstrijd heeft al registraties en wordt niet verwijderd. Pas hem aan in plaats van verwijderen.'
    );
  }

  ['Wedstrijden', 'Aanwezigheid', 'Opstellingen'].forEach(function (naam) {
    vervangVoorWedstrijd_(naam, wedstrijdId, []);
  });
  return { ok: true, data: { verwijderd: wedstrijdId }, versie: 0 };
}

function spelersBewaren_(spelers) {
  if (!spelers || !spelers.length) return { ok: true, data: { aantal: 0 }, versie: 0 };
  schrijf_(
    'Spelers',
    spelers.map(function (s) {
      return {
        speler_id: s.id,
        naam: s.naam,
        rugnummer: s.rugnummer,
        actief: s.actief === false ? 'nee' : 'ja',
      };
    })
  );
  return { ok: true, data: { aantal: spelers.length }, versie: 0 };
}

function planBewaren_(payload, verwachteVersie, coach) {
  var id = payload && payload.wedstrijd && payload.wedstrijd.wedstrijd_id;
  if (!id) return foutmelding_('SERVERFOUT', 'wedstrijd_id ontbreekt.');

  var huidige = 0;
  lees_('Wedstrijden').forEach(function (r) {
    if (String(r.wedstrijd_id) === String(id)) huidige = Number(r.versie) || 0;
  });

  if (typeof verwachteVersie === 'number' && verwachteVersie !== huidige) {
    return foutmelding_(
      'CONFLICT',
      'Het plan staat in de sheet op versie ' +
        huidige +
        ', jij schrijft vanaf versie ' +
        verwachteVersie +
        '.'
    );
  }

  var nieuweVersie = huidige + 1;

  vervangVoorWedstrijd_('Wedstrijden', id, [
    {
      wedstrijd_id: id,
      datum: payload.wedstrijd.datum,
      tijd: payload.wedstrijd.tijd,
      tegenstander: payload.wedstrijd.tegenstander,
      thuis_uit: payload.wedstrijd.thuis_uit,
      team_grootte: payload.wedstrijd.team_grootte,
      status: payload.wedstrijd.status || 'gepland',
      versie: nieuweVersie,
      plan_af: payload.wedstrijd.plan_af ? 'ja' : 'nee',
      laatst_door: coach || '',
      laatst_op: new Date().toISOString(),
      competitieperiode: competitieperiode_(payload.wedstrijd.competitieperiode),
    },
  ]);

  vervangVoorWedstrijd_(
    'Aanwezigheid',
    id,
    (payload.aanwezigheid || []).map(function (r) {
      return { wedstrijd_id: id, speler_id: r.speler_id, aanwezig: r.aanwezig ? 'ja' : 'nee' };
    })
  );

  vervangVoorWedstrijd_(
    'Opstellingen',
    id,
    (payload.opstellingen || []).map(function (r) {
      return {
        wedstrijd_id: id,
        periode: r.periode,
        categorie: r.categorie,
        plek: r.plek,
        speler_id: r.speler_id,
      };
    })
  );

  return { ok: true, data: { versie: nieuweVersie }, versie: nieuweVersie };
}

// --- Hulpfuncties ---

/**
 * Google Sheets maakt van een geplakte datum een echte datumwaarde. Zonder deze
 * omzetting leest de app "Fri Aug 29 2026" in plaats van "2026-08-29".
 */
function alsDatum_(waarde) {
  if (waarde instanceof Date) {
    return Utilities.formatDate(waarde, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(waarde === undefined || waarde === null ? '' : waarde).trim();
}

/** Zelfde verhaal voor tijden. Accepteert ook de notatie 08.30 uit een programma. */
function alsTijd_(waarde) {
  if (waarde instanceof Date) {
    return Utilities.formatDate(waarde, Session.getScriptTimeZone(), 'HH:mm');
  }
  var tekst = String(waarde === undefined || waarde === null ? '' : waarde).trim();
  return tekst.replace('.', ':');
}

function naarWedstrijdRij_(r) {
  return {
    wedstrijd_id: String(r.wedstrijd_id),
    datum: alsDatum_(r.datum),
    tijd: alsTijd_(r.tijd),
    tegenstander: String(r.tegenstander || ''),
    thuis_uit: String(r.thuis_uit || 'thuis'),
    team_grootte: Number(r.team_grootte) || 0,
    status: String(r.status || 'gepland'),
    versie: Number(r.versie) || 0,
    plan_af: String(r.plan_af || '') === 'ja',
    laatst_door: String(r.laatst_door || ''),
    laatst_op: String(r.laatst_op || ''),
    competitieperiode: competitieperiode_(r.competitieperiode),
  };
}

/**
 * Competitieperiode 1 tot en met 4. Wedstrijden van voor deze kolom bestond
 * hebben een lege cel; die horen bij de eerste periode.
 */
function competitieperiode_(waarde) {
  var n = Number(waarde);
  return n >= 1 && n <= 4 ? Math.floor(n) : 1;
}

function naarGebeurtenisRij_(r) {
  return {
    gebeurtenis_id: String(r.gebeurtenis_id),
    volgnummer: Number(r.volgnummer) || 0,
    periode: Number(r.periode),
    tijdstip: String(r.tijdstip),
    type: String(r.type),
    speler_id: String(r.speler_id || ''),
    speler_uit: String(r.speler_uit || ''),
    speler_in: String(r.speler_in || ''),
    categorie: String(r.categorie || ''),
    plek: String(r.plek || ''),
    coach: String(r.coach || ''),
    omschrijving: String(r.omschrijving || ''),
    verwijdert: String(r.verwijdert || ''),
  };
}

function blad_(naam) {
  var blad = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(naam);
  if (!blad) throw new Error('Tabblad ontbreekt: ' + naam);
  return blad;
}

function controleerSchema_() {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var problemen = [];
  Object.keys(SCHEMA).forEach(function (naam) {
    var blad = doc.getSheetByName(naam);
    if (!blad) {
      problemen.push('tabblad ' + naam);
      return;
    }
    if (blad.getLastColumn() === 0) {
      problemen.push(naam + ' (geen koprij)');
      return;
    }
    var koppen = blad.getRange(1, 1, 1, blad.getLastColumn()).getValues()[0].map(String);
    SCHEMA[naam].forEach(function (kolom) {
      if (koppen.indexOf(kolom) === -1) problemen.push(naam + '.' + kolom);
    });
  });
  return problemen;
}

function lees_(naam) {
  var blad = blad_(naam);
  if (blad.getLastRow() < 2) return [];
  var waarden = blad.getRange(1, 1, blad.getLastRow(), blad.getLastColumn()).getValues();
  var koppen = waarden.shift();
  return waarden
    .filter(function (rij) {
      return rij.join('') !== '';
    })
    .map(function (rij) {
      var obj = {};
      koppen.forEach(function (k, i) {
        obj[k] = rij[i];
      });
      return obj;
    });
}

function schrijf_(naam, rijen) {
  var blad = blad_(naam);
  var koppen = koppenVan_(blad);
  if (blad.getLastRow() > 1) {
    blad.getRange(2, 1, blad.getLastRow() - 1, koppen.length).clearContent();
  }
  if (!rijen.length) return;
  blad.getRange(2, 1, rijen.length, koppen.length).setValues(
    rijen.map(function (obj) {
      return naarRij_(koppen, obj);
    })
  );
}

function vervangVoorWedstrijd_(naam, wedstrijdId, nieuweRijen) {
  var behouden = lees_(naam).filter(function (r) {
    return String(r.wedstrijd_id) !== String(wedstrijdId);
  });
  schrijf_(naam, behouden.concat(nieuweRijen));
}

function logRegel_(verzoek, antwoord) {
  try {
    var log = blad_('Wijzigingslog');
    var payload = verzoek.payload || {};
    log.appendRow(
      naarRij_(koppenVan_(log), {
        wijziging_id: Utilities.getUuid(),
        tijdstip: new Date().toISOString(),
        request_id: verzoek.requestId,
        actie: verzoek.actie,
        wedstrijd_id: payload.wedstrijdId || (payload.wedstrijd && payload.wedstrijd.wedstrijd_id) || '',
        coach: verzoek.coach || '',
        samenvatting: JSON.stringify(antwoord.data).slice(0, 500),
      })
    );
  } catch (error) {
    // Een mislukte logregel mag het opslaan niet tegenhouden.
  }
}

function foutmelding_(code, bericht) {
  return { ok: false, error: { code: code, message: bericht } };
}

function json_(waarde) {
  return ContentService.createTextOutput(JSON.stringify(waarde)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// --- Analysetabbladen ---
//
// Draai bouwAnalyse() vanuit de editor als je wilt rapporteren. De tabbladen
// worden elke keer opnieuw opgebouwd uit de ruwe gegevens, dus ze kunnen niet
// uit de pas lopen. Ze staan bewust niet in SCHEMA: de app heeft ze niet nodig
// en mag er niet op stuklopen.
//
// Analyse_periodes  : een regel per wedstrijd en periode. Hiermee zie je
//                     wanneer doelpunten vallen, over het hele seizoen.
// Analyse_spelers   : een regel per wedstrijd en speler. Posities, speeltijd,
//                     wisselbeurten en doelpunten.
//
// Beide hebben een kolom competitieperiode, zodat je in een draaitabel per
// competitieperiode kunt filteren of vergelijken. Ze gebruiken dezelfde
// rekenkern als het seizoensoverzicht in de app.

var ANALYSE_PERIODES = [
  'wedstrijd_id','datum','competitieperiode','tegenstander','thuis_uit','periode',
  'doelpunten_voor','doelpunten_tegen','saldo','formatie','start','wissels',
  'begin_periode','keeper',
];

var ANALYSE_SPELERS = [
  'wedstrijd_id','datum','competitieperiode','tegenstander','thuis_uit','speler_id','naam',
  'rugnummer','aanwezig','periodes_in_wedstrijd','periodes_gespeeld','periodes_bank',
  'als_keeper','als_verdediger','als_middenvelder','als_aanvaller',
  'wissels_in','wissels_uit','wissels_totaal','doelpunten',
];

function bouwAnalyse() {
  var data = laadSeizoen_();
  var opstPer = groepeer_(data.opstellingen);
  var gebPer = groepeer_(data.gebeurtenissen);
  var aanwPer = groepeer_(data.aanwezigheid);

  var naamVan = {};
  var nummerVan = {};
  data.spelers.forEach(function (s) {
    naamVan[String(s.speler_id)] = String(s.naam);
    nummerVan[String(s.speler_id)] = Number(s.rugnummer) || 0;
  });

  var perPeriode = [];
  var perSpeler = [];

  data.wedstrijden.forEach(function (w) {
    var id = w.wedstrijd_id;
    var geb = gebPer[id] || [];
    var verl = verloopVan_(opstPer[id] || [], geb);
    var basis = {
      wedstrijd_id: id,
      datum: w.datum,
      competitieperiode: w.competitieperiode,
      tegenstander: w.tegenstander,
      thuis_uit: w.thuis_uit,
    };

    // Een regel per periode. Periode 0 bestaat alleen als er doelpunten met
    // een onbekende periode zijn, bijvoorbeeld uit een correctie achteraf.
    // Zo kloppen de totalen per wedstrijd, en filter je periode 0 weg als je
    // naar het verloop binnen de wedstrijd kijkt.
    for (var p = 0; p <= 4; p++) {
      var inPeriode = geb.filter(function (g) {
        return Number(g.periode) === p;
      });
      var voor = inPeriode.filter(function (g) { return String(g.type) === 'doelpunt_voor'; }).length;
      var tegen = inPeriode.filter(function (g) { return String(g.type) === 'doelpunt_tegen'; }).length;
      if (p === 0) {
        if (voor || tegen) {
          perPeriode.push(Object.assign({}, basis, {
            periode: 0, doelpunten_voor: voor, doelpunten_tegen: tegen, saldo: voor - tegen,
            formatie: '', start: 'onbekend', wissels: 0, begin_periode: '', keeper: '',
          }));
        }
        continue;
      }
      if (!verl[p].ingevuld && !voor && !tegen) continue;

      var linies = { Verdediger: 0, Middenvelder: 0, Aanvaller: 0 };
      Object.keys(verl[p].begin).forEach(function (k) {
        var cat = categorieVan_(k);
        if (linies[cat] !== undefined) linies[cat]++;
      });
      var start = '';
      inPeriode.forEach(function (g) {
        if (String(g.type) === 'periode') start = String(g.tijdstip || '');
      });

      perPeriode.push(Object.assign({}, basis, {
        periode: p,
        doelpunten_voor: voor,
        doelpunten_tegen: tegen,
        saldo: voor - tegen,
        formatie: verl[p].ingevuld
          ? '1-' + linies.Verdediger + '-' + linies.Middenvelder + '-' + linies.Aanvaller
          : '',
        start: verl[p].doorgegaan ? 'doorgegaan' : 'plan',
        wissels: inPeriode.filter(function (g) { return String(g.type) === 'wissel'; }).length,
        begin_periode: start,
        keeper: naamVan[verl[p].begin.keeper] || '',
      }));
    }

    // Een regel per speler
    var ingevuld = [1, 2, 3, 4].filter(function (q) { return verl[q].ingevuld; }).length;
    var aanwezig = {};
    (aanwPer[id] || []).forEach(function (a) {
      aanwezig[String(a.speler_id)] = String(a.aanwezig) === 'ja' || a.aanwezig === true;
    });

    Object.keys(naamVan).forEach(function (sp) {
      var gespeeld = 0;
      var rollen = { Keeper: 0, Verdediger: 0, Middenvelder: 0, Aanvaller: 0 };
      for (var q = 1; q <= 4; q++) {
        if (verl[q].gespeeld[sp]) gespeeld++;
        Object.keys(verl[q].rollen[sp] || {}).forEach(function (cat) {
          if (rollen[cat] !== undefined) rollen[cat]++;
        });
      }
      var erin = 0;
      var eruit = 0;
      var doelpunten = 0;
      geb.forEach(function (g) {
        var type = String(g.type);
        if (type === 'wissel') {
          if (String(g.speler_in) === sp) erin++;
          if (String(g.speler_uit) === sp) eruit++;
        } else if (type === 'doelpunt_voor' && String(g.speler_id) === sp) {
          doelpunten++;
        }
      });
      if (!gespeeld && aanwezig[sp] === undefined) return;

      perSpeler.push(Object.assign({}, basis, {
        speler_id: sp,
        naam: naamVan[sp],
        rugnummer: nummerVan[sp],
        aanwezig: aanwezig[sp] ? 'ja' : 'nee',
        periodes_in_wedstrijd: ingevuld,
        periodes_gespeeld: gespeeld,
        periodes_bank: aanwezig[sp] ? Math.max(0, ingevuld - gespeeld) : 0,
        als_keeper: rollen.Keeper,
        als_verdediger: rollen.Verdediger,
        als_middenvelder: rollen.Middenvelder,
        als_aanvaller: rollen.Aanvaller,
        wissels_in: erin,
        wissels_uit: eruit,
        wissels_totaal: erin + eruit,
        doelpunten: doelpunten,
      }));
    });
  });

  vulTabblad_('Analyse_periodes', ANALYSE_PERIODES, perPeriode);
  vulTabblad_('Analyse_spelers', ANALYSE_SPELERS, perSpeler);

  Logger.log('Analyse_periodes: ' + perPeriode.length + ' regels');
  Logger.log('Analyse_spelers: ' + perSpeler.length + ' regels');
  return { periodes: perPeriode.length, spelers: perSpeler.length };
}

function vulTabblad_(naam, koppen, rijen) {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var blad = doc.getSheetByName(naam) || doc.insertSheet(naam);
  blad.clear();
  blad.getRange(1, 1, 1, koppen.length).setValues([koppen]).setFontWeight('bold');
  blad.setFrozenRows(1);
  if (!rijen.length) return;
  blad.getRange(2, 1, rijen.length, koppen.length).setValues(
    rijen.map(function (obj) {
      return koppen.map(function (k) {
        return obj[k] === undefined || obj[k] === null ? '' : obj[k];
      });
    })
  );
}
