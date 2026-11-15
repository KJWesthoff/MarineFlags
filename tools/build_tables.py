#!/usr/bin/env python3
"""Build src/data/tables.json: the tables and lists that signals in Pub. 102 refer to.

Usage:
    python3 tools/build_tables.py pub102.txt src/data/tables.json

Tables M-1 and M-2 are parsed from the `pdftotext -layout` text. The rest are short, or laid
out in ways that do not survive text extraction, and are transcribed below.
"""
import json
import re
import sys
from pathlib import Path


def rows(*items):
    return [{"n": str(n), "text": text, **({"detail": detail[0]} if detail else {})} for n, text, *detail in items]


C1 = {
    "title": "Complements Table 1",
    "subtitle": "Means of communication",
    "source": "Chapter 2, Section 10",
    "groups": [{"rows": rows(
        (1, "Morse signaling by hand flags or arms"),
        (2, "Loud hailer (megaphone)"),
        (3, "Morse signaling lamp"),
        (4, "Sound signals"),
    )}],
}

C2 = {
    "title": "Complements Table 2",
    "subtitle": "Assistance and supplies",
    "source": "Chapter 2, Section 10",
    "groups": [{"rows": rows(
        (0, "Water"), (1, "Provisions"), (2, "Fuel"), (3, "Pumping equipment"),
        (4, "Firefighting appliances"), (5, "Medical assistance"), (6, "Towing"),
        (7, "Survival craft"), (8, "Vessel to stand by"), (9, "Icebreaker"),
    )}],
}

C3 = {
    "title": "Complements Table 3",
    "subtitle": "Directions",
    "source": "Chapter 2, Section 10",
    "groups": [{"rows": rows(
        (0, "Direction unknown (or calm)"), (1, "Northeast"), (2, "East"), (3, "Southeast"),
        (4, "South"), (5, "Southwest"), (6, "West"), (7, "Northwest"), (8, "North"),
        (9, "All directions (or confused or variable)"),
    )}],
}

AGROUND = {
    "title": "Complements to JF",
    "subtitle": "How the vessel is aground",
    "source": "Chapter 2, Section 2",
    "groups": [{"rows": rows(
        (0, "On rocky bottom."), (1, "On soft bottom."), (2, "Forward."), (3, "Amidship."), (4, "Aft."),
        (5, "At high water forward."), (6, "At high water amidship."), (7, "At high water aft."),
        (8, "Full length of vessel."), (9, "Full length of vessel at high water."),
    )}],
}

JETTISON = {
    "title": "Complements to JP and JQ",
    "subtitle": "What is jettisoned",
    "source": "Chapter 2, Section 2",
    "groups": [{"rows": rows(
        (1, "Cargo."), (2, "Bunkers."), (3, "Everything movable forward."), (4, "Everything movable aft."),
    )}],
}

PASSAGE = {
    "title": "Conditions of innocent passage",
    "subtitle": "Complements to UV 4, UV 5 and UV 6",
    "source": "Chapter 2, Section 5",
    "note": "Signals UV 1 to UV 9 are not mandatory. Use of these signals is not a precondition to the "
            "exercise of the right of innocent passage or freedom of navigation.",
    "groups": [{"rows": rows(
        (0, "By threatening or using force against our/your sovereignty, territorial integrity, or political independence."),
        (1, "By exercising or practicing with weapons."),
        (2, "By engaging in acts aimed at collecting information to the prejudice of our/your defense or security."),
        (3, "By engaging in acts of propaganda aimed at affecting our/your defense or security."),
        (4, "By engaging in the launching, landing or taking on board of aircraft or a military device."),
        (5, "By engaging in the loading or unloading of a commodity, currency or person contrary to the customs, "
            "fiscal, immigration or sanitary laws or regulations of our/your country."),
        (6, "By engaging in willful and serious pollution."),
        (7, "By engaging in fishing activities."),
        (8, "By engaging in research or survey activities."),
        (9, "By engaging in acts aimed at interfering with our/your systems of communication or other facilities "
            "or installations."),
    )}],
}

SEA = {
    "title": "State of the sea",
    "subtitle": "Complements to WY and XB, by wave height",
    "source": "Chapter 2, Section 6",
    "groups": [{"rows": rows(
        (0, "Calm (glassy)", "0 m (0 ft)"),
        (1, "Calm (rippled)", "0–0.1 m (0–1/3 ft)"),
        (2, "Smooth (wavelets)", "0.1–0.5 m (1/3–1 2/3 ft)"),
        (3, "Slight", "0.5–1.25 m (1 2/3–4 ft)"),
        (4, "Moderate", "1.25–2.5 m (4–8 ft)"),
        (5, "Rough", "2.5–4 m (8–13 ft)"),
        (6, "Very rough", "4–6 m (13–20 ft)"),
        (7, "High", "6–9 m (20–30 ft)"),
        (8, "Very high", "9–14 m (30–45 ft)"),
        (9, "Phenomenal", "over 14 m (over 45 ft)"),
    )}],
}

SWELL = {
    "title": "State of the swell",
    "subtitle": "Complements to XE and XH",
    "source": "Chapter 2, Section 6",
    "groups": [
        {"rows": rows((0, "No swell"))},
        {"title": "Weak: approximate height under 2 m (6 ft)", "rows": rows((1, "Short or middle"), (2, "Long"))},
        {"title": "Moderate: approximate height 2–4 m (6–12 ft)",
         "rows": rows((3, "Short"), (4, "Middle"), (5, "Long"))},
        {"title": "High: approximate height over 4 m (12 ft)", "rows": rows((6, "Short"), (7, "Middle"), (8, "Long"))},
        {"rows": rows((9, "Confused"))},
    ],
}

MAFOR = {
    "title": "MAFOR Code",
    "source": "Chapter 2, Section 6",
    "note": "MAFOR is the prefix used to identify an International Coded Weather Forecast for Shipping.",
    "groups": [],
}

PRATIQUE_CODES = ["ZS", "ZT", "ZU", "ZV", "ZW", "ZW 1", "ZX", "ZY", "ZZ", "ZZ 1"]
PRATIQUE_NOTE = (
    "By night a red light over a white light may be shown, where it can best be seen, by vessels requiring "
    "health clearance. These lights should only be about 6 feet apart, should be exhibited within the precincts "
    "of a port and should be visible all around the horizon as nearly as possible."
)

# Table M-3: (number, common name, English name, Latin name, strength, caution)
M3_EXTERNAL = [
    (1, "Ear drops", "Glycerin ear drops", "Auristillae Glyceris"),
    (2, "Antiseptic eye drops", "Sulfacetamide eye drops", "Guttae Sulfacetamidi"),
    (3, "Anaesthetic eye drops", "Tetracaine eye drops", "Guttae Tetracainae"),
    (4, "Salicylate liniment", "Methyl salicylate liniment", "Linimentum Methylis Salicylatis"),
    (5, "Calamine lotion", "Calamine lotion", "Lotio Calaminae"),
    (6, "Antiseptic lotion", "Cetrimide lotion", "Lotio Cetrimidi"),
    (7, "Nasal drops", "Norephedrine hydrochloride drops", "Naristillae Ephedrine"),
    (8, "Soft paraffin", "Yellow soft paraffin", "Paraffinum Molle Flavum"),
    (9, "Burn/wound dressing", "Tulle gras dressing (paraffin gauze)", "Paraffinum Molle Flavum Carbasi Absorbentis"),
    (10, "Antibiotic ointment", "Bacitracin ointment", "Unguentum Bacitracini"),
    (11, "Pile ointment", "Compound benzocaine ointment", "Unguentum Benzocaini Compositum"),
    (12, "Local anaesthetic ointment", "Xylocaine ointment", "Unguentum Xylocaini Hydrochloridi"),
]
ANAPHYLAXIS = ("Caution: use only on medical advice by radio, except in case of anaphylactic shock "
               "due to penicillin injection.")
RADIO_ONLY = "Caution: use only on medical advice by radio."
M3_INTERNAL = [
    ("Allergic conditions", [
        (13, "Antihistamine tablets", "Promethazine hydrochloride tablets", "Compressi Promethazini Hydrochloridi", "25 mg per tablet"),
        (14, "Adrenaline", "Adrenaline injection", "Injectio Adrenalini", "1 mg in “Ampins”", ANAPHYLAXIS),
    ]),
    ("Antibiotics", [
        (15, "Tetracycline capsules", "Tetracycline hydrochloride capsules", "Capsulae Tetracyclini Hydrochloridi", "250 mg per capsule"),
        (16, "Penicillin tablets", "Phenoxymethylpenicillin", "Compressi Phenoxymethylpenicillini", "125 mg per tablet"),
        (17, "Sulfonamide tablets", "Sulfadimidine tablets", "Compressi Sulfadimidini", "500 mg per tablet"),
        (18, "Penicillin injection", "Procaine penicillin G", "Injectio Benzylpenicillini", "600,000 units per ampoule"),
        (19, "Streptomycin injection", "Streptomycin sulfate injection", "Injectio Streptomycini Sulfatis", "1,000 mg per ampoule"),
        (20, "Tetracycline injection", "Tetracycline hydrochloride", "Injectio Tetracyclini Hydrochloridi", "100 mg per ampoule"),
    ]),
    ("Asthma", [
        (21, "Asthma relief tablets", "Aminophylline tablets", "Compressi Aminophyllini", "300 mg per tablet", RADIO_ONLY),
        (22, "Ephedrine tablets", "Ephedrine hydrochloride tablets", "Compressi Ephedrini Hydrochloridi", "30 mg per tablet"),
        (23, "Inhalation mixture", "Tincture of benzoin compound", "Tinctura Benzoini Composita"),
    ]),
    ("Cough", [
        (24, "Codeine tablets", "Codeine phosphate tablets", "Compressi Codeini Phosphatis", "15 mg per tablet"),
        (25, "Cough linctus", "Linctus of squill, opiate", "Linctus Scillae Opiata"),
    ]),
    ("Diarrhea", [
        (26, "Diarrhea mixture", "Kaolin and morphine mixture", "Mistura Kaolini et Morphinae"),
    ]),
    ("Heart", [
        (27, "Heart tablets", "Glycerin trinitrate tablets", "Compressi Glycerylis Trinitratis", "0.5 mg per tablet"),
    ]),
    ("Indigestion", [
        (28, "Stomach tablets", "Magnesium trisilicate", "Compressi Magnesii Trisilicas"),
    ]),
    ("Laxatives", [
        (29, "Vegetable laxative tablets", "Compound colocynth and jalap tablets", "Compressi Colocynthidis et Jalapae Compositae"),
        (30, "Liquid laxative (“Milk of Magnesia”)", "Magnesium hydroxide mixture", "Magnesii Hydroxidum"),
    ]),
    ("Malaria", [
        (31, "Malaria tablets", "Chloroquine sulfate tablets", "Compressi Chloroquini Sulfatis", "200 mg per tablet"),
    ]),
    ("Pain", [
        (32, "Aspirin tablets", "Acetylsalicylic acid tablets", "Compressi Acidi Acetylsalicylici", "300 mg per tablet"),
        (33, "Morphine injection", "Morphine sulfate injection", "Injectio Morphini", "15 mg per ampoule"),
    ]),
    ("Sedation", [
        (34, "Sedative tablets", "Butobarbitone tablets", "Compressi Butobarbitali", "100 mg per tablet"),
        (35, "Phenobarbitone tablets", "Phenobarbitone tablets", "Compressi Phenobarbitali", "30 mg per tablet"),
        (36, "Tranquillizer tablets (Largactil)", "Chlorpromazine hydrochloride tablets", "Compressi Chlorpromazini Hydrochloridi", "50 mg per tablet", RADIO_ONLY),
    ]),
    ("Salt depletion or heat cramps", [
        (37, "Salt tablets", "Sodium chloride tablets", "Compressi Natrii Chloridi Solv", "500 mg per tablet"),
    ]),
    ("Seasickness", [
        (38, "Seasickness tablets", "Hyoscine hydrobromide tablets", "Compressi Hyoscini Hydrobromidi", "0.3 mg per tablet"),
    ]),
]


# ---------- Guide topics: background a signaller wants at hand ----------

def stacked(*items):
    return [{"n": heading, "text": text} for heading, text in items]


FLAG_PROCEDURE = {
    "title": "Signaling by flags",
    "subtitle": "How a flag signal is made and answered",
    "source": "Chapter 1, Section 5",
    "keys": "stacked",
    "groups": [{"rows": stacked(
        ("One hoist at a time",
         "As a general rule only one hoist should be shown at a time. Each hoist is kept flying until the receiving "
         "station has answered it. Hoist the signal where the receiving station can see it most easily, with the "
         "flags blowing out clear and free from smoke. Groups shown on the same halyard are separated by a tackline."),
        ("How to call",
         "Hoist the identity signal of the station addressed with the signal. With no identity signal, the signal is "
         "addressed to all stations within visual signaling distance. If you do not know the other station’s identity "
         "signal, first hoist VF (You should hoist your identity signal) or CS (What is the name or identity signal "
         "of your vessel?), together with your own identity signal."),
        ("How to answer",
         "Hoist the answering pennant at the dip as soon as you see each hoist, and close up as soon as you understand "
         "it. Lower it to the dip when the hoist is hauled down, and close up again when the next hoist is understood."),
        ("How to complete a signal",
         "After the last hoist, the transmitting station hoists the answering pennant alone to show the signal is "
         "complete. The receiving station answers it like any other hoist."),
        ("When a signal is not understood",
         "If you cannot make the signal out, keep the answering pennant at the dip. If you can make it out but not "
         "understand it, hoist ZQ (Your signal appears incorrectly coded. You should check and repeat the whole) or "
         "ZL (Your signal has been received but not understood)."),
        ("Substitutes",
         "Substitutes repeat a flag within a group when only one set of flags is carried. The first substitute repeats "
         "the uppermost flag of the class (letters or numerals) of the flag just above it; the second repeats the "
         "second flag of that class, the third the third. No substitute is used more than once in a group. The "
         "answering pennant used as a decimal point is ignored when choosing a substitute. Examples: VV is V, first "
         "substitute. 1100 is 1, first substitute, 0, third substitute. L2330 is L, 2, 3, second substitute, 0."),
        ("How to spell",
         "Names in the text of a signal are spelled out with the alphabetical flags. YZ (The words which follow are "
         "in plain language) can be used first if necessary."),
        ("Code pennant by ships of war",
         "A ship of war wishing to communicate with a merchant vessel hoists the Code pennant in a conspicuous "
         "position and keeps it flying the whole time the signal is being made."),
    )}],
}

TERMS = {
    "title": "Signaling terms",
    "subtitle": "Words the code uses",
    "source": "Chapter 1, Section 2",
    "keys": "stacked",
    "groups": [{"rows": stacked(
        ("Group", "More than one continuous letter and/or numeral which together compose a signal."),
        ("Numeral group", "One or more numerals."),
        ("Hoist", "One or more groups displayed from a single halyard."),
        ("At the dip", "A hoist or signal hoisted about half of the full extent of the halyards."),
        ("Close up", "A hoist or signal hoisted to the full extent of the halyards."),
        ("Tackline", "A length of halyard about 2 m (6 ft) long, used to separate each group of flags."),
        ("Identity signal or call sign",
         "The group of letters and figures assigned to each station by its administration. Identity signals are "
         "allocated internationally, so they can indicate the nationality of a ship or aircraft."),
        ("Station", "A ship, aircraft, survival craft, or any place at which communications can be effected."),
        ("Transmitting station", "The station by which a signal is actually being made."),
        ("Receiving station", "The station by which a signal is actually being read."),
        ("Procedure signal", "A signal designed to facilitate the conduct of signaling."),
        ("Originator", "The authority who orders a signal to be sent."),
        ("Addressee", "The authority to whom a signal is addressed."),
        ("Time of origin", "The time at which a signal is ordered to be made."),
    )}],
}

LETTER_COMPLEMENTS = {
    "title": "Single letters with numerals",
    "subtitle": "A letter followed by figures gives a value",
    "source": "Chapter 1, Section 10",
    "groups": [{"rows": rows(
        ("A", "Azimuth or bearing", "With three numerals."),
        ("C", "Course", "With three numerals."),
        ("D", "Date", "With two, four or six numerals."),
        ("G", "Longitude", "With four or five numerals: the last two are minutes, the rest degrees."),
        ("K", "I wish to communicate with you by… (Complements Table 1)", "With one numeral."),
        ("L", "Latitude", "With four numerals: the first two are degrees, the rest minutes."),
        ("R", "Distance in nautical miles", "With one or more numerals."),
        ("S", "Speed in knots", "With one or more numerals."),
        ("T", "Local time", "With four numerals: the first two are hours, the rest minutes."),
        ("V", "Speed in kilometers per hour", "With one or more numerals."),
        ("Z", "UTC", "With four numerals: the first two are hours, the rest minutes. With one numeral: to call "
              "or address shore visual stations."),
    )}],
}

PROCEDURE_SIGNALS = {
    "title": "Procedure signals",
    "subtitle": "Signals that help conduct signaling",
    "source": "Chapter 1, Section 10",
    "keys": "wide",
    "note": "C, N, NO and RQ cannot be used in conjunction with single-letter signals.",
    "groups": [{"rows": rows(
        ("AA", "“All after…” (used after RPT) means “Repeat all after…”."),
        ("AB", "“All before…” (used after RPT) means “Repeat all before…”."),
        ("AR", "Ending signal, or end of transmission or signal."),
        ("AS", "Waiting signal or period."),
        ("BN", "“All between… and…” (used after RPT) means “Repeat all between… and…”."),
        ("C", "Affirmative: yes, or “The significance of the previous group should be read in the affirmative”."),
        ("CQ", "Call for unknown station(s) or general call to all stations."),
        ("CS", "“What is the name or identity signal of your vessel (or station)?”"),
        ("DE", "“From…” (used to precede the name or identity signal of the calling station)."),
        ("K", "“I wish to communicate with you” or “Invitation to transmit”."),
        ("NO", "Negative: no, or “The significance of the previous group should be read in the negative”."),
        ("OK", "Acknowledging a correct repetition, or “It is correct”."),
        ("RQ", "Interrogative, or “The significance of the previous group should be read as a question”."),
        ("R", "“Received” or “I have received your last signal”."),
        ("RPT", "Repeat signal: “I repeat” or “Repeat what you have sent” or “Repeat what you have received”."),
        ("WA", "“Word or group after…” (used after RPT) means “Repeat word or group after…”."),
        ("WB", "“Word or group before…” (used after RPT) means “Repeat word or group before…”."),
    )}],
}

MORSE_CODES = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.", "G": "--.", "H": "....", "I": "..",
    "J": ".---", "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.",
    "S": "...", "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-", "Y": "-.--", "Z": "--..",
    "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...",
    "8": "---..", "9": "----.", "0": "-----",
}


def morse_rows(chars):
    return [{"n": c, "text": " ".join("•" if s == "." else "–" for s in MORSE_CODES[c])} for c in chars]


MORSE = {
    "title": "Morse code",
    "subtitle": "Letters and numerals",
    "source": "Chapter 1, Section 10",
    "groups": [
        {"title": "Letters", "rows": morse_rows("ABCDEFGHIJKLMNOPQRSTUVWXYZ")},
        {"title": "Numerals", "rows": morse_rows("1234567890")},
    ],
}

DISTRESS = {
    "title": "Distress signals",
    "subtitle": "Prescribed by the International Regulations for Preventing Collisions at Sea, 1972",
    "source": "Chapter 4, Section 1",
    "note": "To be used or displayed, together or separately, by a vessel (or seaplane on the water) in distress "
            "requiring assistance from other vessels or from the shore. Using any of these signals except to "
            "indicate distress, or using signals that may be confused with them, is prohibited.",
    "groups": [{"rows": rows(
        (1, "A gun or other explosive signal fired at intervals of about a minute."),
        (2, "A continuous sounding with any fog-signaling apparatus."),
        (3, "Rockets or shells, throwing red stars fired one at a time at short intervals."),
        (4, "A signal made by radiotelegraphy or by any other signaling method consisting of the group "
            "• • •  – – –  • • • (SOS) in the Morse Code."),
        (5, "A signal sent by radiotelephony consisting of the spoken word “MAYDAY”."),
        (6, "The International Code Signal of distress indicated by NC."),
        (7, "A signal consisting of a square flag having above or below it a ball or anything resembling a ball."),
        (8, "Flames on the vessel (as from a burning tar barrel, oil barrel, etc.)."),
        (9, "A rocket parachute flare or a hand flare showing a red light."),
        (10, "A smoke signal giving off a volume of orange-colored smoke."),
        (11, "Slowly and repeatedly raising and lowering arms outstretched to each side."),
        (12, "The radiotelegraph alarm signal.", "A series of twelve four-second dashes at intervals of one second."),
        (13, "The radiotelephone alarm signal.",
             "Two audio tones transmitted alternately at 2200 Hz and 1300 Hz for 30 seconds to one minute."),
        (14, "Signals transmitted by emergency position-indicating beacons."),
    )}],
}


def build_prefixes():
    allocations = json.loads(Path(__file__).with_name("itu_prefixes.json").read_text())
    return {
        "title": "Call sign prefixes",
        "subtitle": "The country a call sign (identity signal) belongs to",
        "credit": "International Telecommunication Union, Radio Regulations, Appendix 42: allocation of "
                  "international call sign series.",
        "keys": "wide",
        "note": "A ship’s call sign starts with characters from a series allocated to its flag state, so the first "
                "one or two characters of an identity signal show its nationality.",
        "groups": [{"rows": [{"n": prefix, "text": country} for prefix, country in allocations]}],
    }


GUIDE = ["FLAGS", "TERMS", "LETTERS", "PROCEDURE", "MORSE", "DISTRESS", "PREFIX"]


def medicament(n, common, english, latin, strength=None, caution=None):
    detail = f"{english} ({latin})" if english.lower() != common.lower() else latin
    if strength:
        detail += f". {strength[0].upper()}{strength[1:]}"
    row = {"n": str(n), "text": common, "detail": detail + "."}
    if caution:
        row["caution"] = caution
    return row


def build_m3():
    return {
        "title": "Table M-3",
        "subtitle": "List of medicaments",
        "source": "Chapter 3, Section 4",
        "note": "Preparations listed may have been substituted by equivalent preparations in the ship’s medicine "
                "chest. Latin names are given so that a correct translation can be found in each language. "
                "For congestive heart failure, chlorothiazide (500 mg per tablet) and digoxin (0.25 mg per tablet) "
                "or equivalents are available on board, but should be used only on medical advice transmitted in "
                "plain language and not by code.",
        "groups": [{"title": "For external use", "rows": [medicament(*m) for m in M3_EXTERNAL]}]
        + [{"title": f"For internal use: {name.lower()}", "rows": [medicament(*m) for m in items]}
           for name, items in M3_INTERNAL],
    }


def section(lines, start_pattern, end_pattern):
    start = max(i for i, l in enumerate(lines) if re.search(start_pattern, l))
    end = next(i for i in range(start, len(lines)) if re.search(end_pattern, lines[i]))
    return lines[start:end]


def build_m1(lines):
    found = {}
    for line in section(lines, r"TABLE M-1.REGIONS OF THE BODY\s*$", r"Indicate side as required"):
        for star, n, name in re.findall(r"(\*?)(\d{1,2})\.?\s+([A-Za-z][A-Za-z ,()]*?)(?=\s+\*?\d|\s*$)", line):
            found[int(n)] = {"n": n, "text": name.strip(), **({"star": True} if star else {})}
    assert sorted(found) == list(range(1, 93)), sorted(set(range(1, 93)) - set(found))
    pick = lambda a, b: [found[i] for i in range(a, b + 1)]
    return {
        "title": "Table M-1",
        "subtitle": "Regions of the body",
        "source": "Chapter 3, Section 4",
        "note": "Side of body or limb affected should be clearly indicated: right, left. "
                "For regions marked *, indicate side as required.",
        "groups": [
            {"title": "Front of the body", "rows": pick(1, 36)},
            {"title": "Back of the body", "rows": pick(37, 56)},
            {"title": "Other organs of the body", "rows": pick(57, 92)},
        ],
    }


def build_m2(lines):
    found = {}
    for line in section(lines, r"TABLE M-2.LIST OF COMMON DISEASES\s*$", r"TABLE M-3"):
        for n, name in re.findall(r"(\d{1,2})\.\s+(\S.*?)(?=\s{3,}|\s*$)", line):
            found[int(n)] = {"n": n, "text": name.strip()}
    assert sorted(found) == list(range(1, 95)), sorted(set(range(1, 95)) - set(found))
    return {
        "title": "Table M-2",
        "subtitle": "List of common diseases",
        "source": "Chapter 3, Section 4",
        "groups": [{"rows": [found[i] for i in range(1, 95)]}],
    }


def main():
    text_path, out = sys.argv[1:3]
    lines = Path(text_path).read_text(errors="replace").splitlines()
    codebook = {e["code"]: e for e in json.loads(Path(out).with_name("codebook.json").read_text())}

    pratique = {
        "title": "Pratique messages",
        "subtitle": "International Health Regulations",
        "source": "Chapter 2, Section 9",
        "note": PRATIQUE_NOTE,
        "groups": [{"rows": [{"n": c, "text": codebook[c]["meaning"]} for c in PRATIQUE_CODES]}],
    }

    tables = {
        "C1": C1, "C2": C2, "C3": C3,
        "M1": build_m1(lines), "M2": build_m2(lines), "M3": build_m3(),
        "AGROUND": AGROUND, "JETTISON": JETTISON, "PASSAGE": PASSAGE,
        "SEA": SEA, "SWELL": SWELL, "MAFOR": MAFOR, "PRATIQUE": pratique,
        "FLAGS": FLAG_PROCEDURE, "TERMS": TERMS, "LETTERS": LETTER_COMPLEMENTS,
        "PROCEDURE": PROCEDURE_SIGNALS, "MORSE": MORSE, "DISTRESS": DISTRESS, "PREFIX": build_prefixes(),
    }
    # Signals that point at a list without naming a numbered table.
    by_code = {
        "JF": ["AGROUND"], "JP": ["JETTISON"], "JQ": ["JETTISON"],
        "UV 4": ["PASSAGE"], "UV 5": ["PASSAGE"], "UV 6": ["PASSAGE"],
        "WY": ["SEA"], "XB": ["SEA"], "XE": ["SWELL"], "XH": ["SWELL"],
        "XV": ["MAFOR"], "QQ": ["PRATIQUE"],
    }
    Path(out).write_text(json.dumps({"tables": tables, "byCode": by_code, "guide": GUIDE}, ensure_ascii=False, indent=1) + "\n")
    print({k: sum(len(g["rows"]) for g in t["groups"]) for k, t in tables.items()}, file=sys.stderr)


if __name__ == "__main__":
    main()
