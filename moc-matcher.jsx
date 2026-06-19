import { useState, useCallback, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

// ── MOC CANONICAL ARCHETYPES ─────────────────────────────────────────────────
// Sourced from 350-row mappings file across multiple dealers/DMS formats.
// Keyed by canonical 5-digit bare part number (from Manufacturer Part field).
// Incentive = max observed across all dealers.
const MOC_MAPPINGS = [
  { barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ",                                        incentive: 5  },
  { barePartNumber: "01121", manufacturerPart: "01121 - FUEL INJECTOR FLUSH, 12OZ",                                   incentive: 10 },
  { barePartNumber: "01161", manufacturerPart: "01161 - KIT, COOLING SYSTEM FLUSH",                              incentive: 10 },
  { barePartNumber: "01211", manufacturerPart: "01211 - PREMIUM ENGINE TREATMENT, 11OZ",                        incentive: 5  },
  { barePartNumber: "01221", manufacturerPart: "01221 - PREMIUM DIESEL ENGINE TREATMENT, 11OZ",                 incentive: 4  },
  { barePartNumber: "01222", manufacturerPart: "01222 - PREMIUM DIESEL ENGINE TREATMENT, 32OZ",                 incentive: 0  },
  { barePartNumber: "01241", manufacturerPart: "01241 - MULTI-CLEAN MAX, 11OZ",                                 incentive: 10 },
  { barePartNumber: "01291", manufacturerPart: "01291 - PREMIUM FUEL GUARD, 12OZ",                             incentive: 5  },
  { barePartNumber: "01401", manufacturerPart: "01401 - QUIET BRAKES, 1OZ",                                          incentive: 5  },
  { barePartNumber: "01441", manufacturerPart: "01441 - DIESEL PURGE, 12OZ",                                          incentive: 0  },
  { barePartNumber: "01451", manufacturerPart: "01451 - ADVANCED DIESEL TREATMENT (A.D.T.), 12OZ",              incentive: 5  },
  { barePartNumber: "01601", manufacturerPart: "01601 - BANISH RODENT DETERRENT, 8OZ",                          incentive: 10 },
  { barePartNumber: "01901", manufacturerPart: "01901 - KIT, QUIET BRAKES 2-PART",                                  incentive: 4  },
  { barePartNumber: "01941", manufacturerPart: "01941 - KIT, ATF FLUSH",                                         incentive: 10 },
  { barePartNumber: "02271", manufacturerPart: "02271 - KIT, USED-CAR 4-PART",                                   incentive: 0  },
  { barePartNumber: "02321", manufacturerPart: "02321 - COMPLETE FUEL SYSTEM SERVICE",                          incentive: 10 },
  { barePartNumber: "02871", manufacturerPart: "02871 - KIT, BATTERY SERVICE 2-PART",                           incentive: 10 },
  { barePartNumber: "02911", manufacturerPart: "02911 - KIT, MP BRITE HEADLIGHT RESTORATION 7-PART",            incentive: 10 },
  { barePartNumber: "03451", manufacturerPart: "03451 - KIT, PREMIUM BRAKE FLUID & LUBE 3-PART",                incentive: 10 },
  { barePartNumber: "03461", manufacturerPart: "03461 - KIT, PREMIUM BRAKE CALIPER LUBE 2-PART",                incentive: 5  },
  { barePartNumber: "03771", manufacturerPart: "03771 - TECH GRADE POWER-STEERING FLUID",                       incentive: 10 },
  { barePartNumber: "04113", manufacturerPart: "04113 - PREMIUM MULTI-VEHICLE SYNTHETIC ATF, 1 GAL",            incentive: 5  },
  { barePartNumber: "04114", manufacturerPart: "04114 - PREMIUM MULTI-VEHICLE SYNTHETIC ATF, 3 GAL",            incentive: 0  },
  { barePartNumber: "04133", manufacturerPart: "04133 - PREMIUM ATF LV, 1 GAL",                                 incentive: 5  },
  { barePartNumber: "04152", manufacturerPart: "04152 - ULTRA SHIFT, 32OZ",                                     incentive: 0  },
  { barePartNumber: "04172", manufacturerPart: "04172 - MULTI-VEHICLE SYNTHETIC CVT FLUID, 32OZ",               incentive: 2  },
  { barePartNumber: "04181", manufacturerPart: "04181 - UNIVERSAL CVT CONDITIONER, 11OZ",                       incentive: 5  },
  { barePartNumber: "04211", manufacturerPart: "04211 - SYNTHETIC ATF HP, 32OZ",                                  incentive: 0  },
  { barePartNumber: "04271", manufacturerPart: "04271 - GEAR GUARD PLUS SAE 75W-90, 32OZ",                          incentive: 5  },
  { barePartNumber: "04421", manufacturerPart: "04421 - MP BOOST, 10OZ",                                        incentive: 5  },
  { barePartNumber: "04441", manufacturerPart: "04441 - MP PROTECT, COOLING SYSTEM PROTECTION, 10OZ",           incentive: 10 },
  { barePartNumber: "04461", manufacturerPart: "04461 - SHYFT, 12OZ",                                           incentive: 10 },
  { barePartNumber: "05591", manufacturerPart: "05591 - EV/HEV PREMIUM BRAKE SERVICE 4PK",                  incentive: 5  },
  { barePartNumber: "06002", manufacturerPart: "06002 - BRAKE FLUID, DOT 3 - HEAVY DUTY, 32OZ",                 incentive: 5  },
  { barePartNumber: "06011", manufacturerPart: "06011 - PREMIUM DOT 4 BRAKE FLUID, 53OZ",                       incentive: 5  },
  { barePartNumber: "06012", manufacturerPart: "06012 - PREMIUM DOT 4 BRAKE FLUID, 32OZ",                       incentive: 10 },
  { barePartNumber: "06181", manufacturerPart: "06181 - TECH GRADE POWER STEERING FLUID, 1/2GAL",               incentive: 0  },
  { barePartNumber: "06201", manufacturerPart: "06201 - ARCTIC BLAST",                                          incentive: 10 },
  { barePartNumber: "06571", manufacturerPart: "06571 - ADVANCED ENGINE TREATMENT, 12OZ",                       incentive: 5  },
  { barePartNumber: "10081", manufacturerPart: "10081 - PARTS WASH, 13OZ",                                            incentive: 0  },
  { barePartNumber: "10431", manufacturerPart: "10431 - THROTTLE-BODY & AIR-INTAKE CLEANER, 4.5OZ",   incentive: 10 },
  { barePartNumber: "10507", manufacturerPart: "10507 - FRESH A/C, 2OZ AEROSOL",                                incentive: 10 },
  { barePartNumber: "10521", manufacturerPart: "10521 - EVAPORATOR CORE CLEANER, 10OZ",                         incentive: 0  },
  { barePartNumber: "10951", manufacturerPart: "10951 - MASS AIR FLOW SENSOR CLEANER, 4.5OZ AEROSOL",           incentive: 10 },
  { barePartNumber: "10971", manufacturerPart: "10971 - CHARGE PORT CLEANER, 2OZ AEROSOL",                      incentive: 10 },
  { barePartNumber: "16501", manufacturerPart: "16501 - OPTIMIZER, 13OZ",                                       incentive: 10 },
  { barePartNumber: "61131", manufacturerPart: "61131 - WINDSHIELD WASHER SOLVENT, 8OZ",                              incentive: 2  },
  { barePartNumber: "62941", manufacturerPart: "62941 - MP VISION GLASS TREATMENT",                             incentive: 10 },
  { barePartNumber: "62951", manufacturerPart: "62951 - VISION GLASS TREATMENT, 0.75OZ",                        incentive: 0  },

  // ── EXPANDED ARCHETYPE SET (added from manufacturer data) ──────────────────
  { barePartNumber: "01031", manufacturerPart: "01031 - AUTOMATIC TRANSMISSION FLUID CONDITIONER, 8OZ", incentive: 0 },
  { barePartNumber: "01111", manufacturerPart: "01111 - COOLING SYSTEM TREATMENT, 8OZ", incentive: 0 },
  { barePartNumber: "01141", manufacturerPart: "01141 - EXTREME-PRESSURE LUBRICANT, 6OZ", incentive: 0 },
  { barePartNumber: "01151", manufacturerPart: "01151 - POWER-STEERING-FLUID CONDITIONER, 6OZ", incentive: 0 },
  { barePartNumber: "01171", manufacturerPart: "01171 - MULTI-CLEAN, 8OZ", incentive: 0 },
  { barePartNumber: "01181", manufacturerPart: "01181 - PREMIUM ATF CLEANER, 11OZ", incentive: 0 },
  { barePartNumber: "01201", manufacturerPart: "01201 - DOUBLE CLEAN, 12OZ", incentive: 0 },
  { barePartNumber: "01231", manufacturerPart: "01231 - POWER STEERING FLUID EXCHANGE, 64OZ", incentive: 0 },
  { barePartNumber: "01271", manufacturerPart: "01271 - PREMIUM FUEL TREATMENT, 12OZ", incentive: 0 },
  { barePartNumber: "01281", manufacturerPart: "01281 - VACU FLUSH, 12OZ", incentive: 0 },
  { barePartNumber: "01301", manufacturerPart: "01301 - BATTERY-TERMINAL PROTECTORS", incentive: 0 },
  { barePartNumber: "01361", manufacturerPart: "01361 - A/C QUIET MAX, 2OZ", incentive: 0 },
  { barePartNumber: "01368", manufacturerPart: "01368 - A/C QUIET MAX, 8OZ", incentive: 0 },
  { barePartNumber: "01442", manufacturerPart: "01442 - DIESEL PURGE, 32OZ", incentive: 0 },
  { barePartNumber: "01452", manufacturerPart: "01452 - ADVANCED DIESEL TREATMENT (A.D.T.), 32OZ", incentive: 0 },
  { barePartNumber: "01481", manufacturerPart: "01481 - GEAR GUARD 75W140, 32OZ", incentive: 0 },
  { barePartNumber: "01491", manufacturerPart: "01491 - LIMITED SLIP CONCENTRATE, 4OZ", incentive: 0 },
  { barePartNumber: "01501", manufacturerPart: "01501 - BATTERY CLEANER & LEAK DETECTOR, 2OZ", incentive: 0 },
  { barePartNumber: "01603", manufacturerPart: "01603 - BANISH RODENT DETERRENT, 1 GAL", incentive: 0 },
  { barePartNumber: "01661", manufacturerPart: "01661 - KIT, CARBON CLEANER FLUSH 3-PART", incentive: 0 },
  { barePartNumber: "01741", manufacturerPart: "01741 - KIT, DECARB FLUSH 2-PART", incentive: 0 },
  { barePartNumber: "01801", manufacturerPart: "01801 - KIT, MP POWER RESTORE FUEL", incentive: 0 },
  { barePartNumber: "01861", manufacturerPart: "01861 - KIT, FUEL-SYSTEM & AIR-INTAKE 2-PART", incentive: 0 },
  { barePartNumber: "01871", manufacturerPart: "01871 - KIT, MP POWER CLEAN FUEL", incentive: 0 },
  { barePartNumber: "02001", manufacturerPart: "02001 - KIT, MENU", incentive: 0 },
  { barePartNumber: "02021", manufacturerPart: "02021 - DECARB THROTTLE BODY KIT 3PK", incentive: 0 },
  { barePartNumber: "02031", manufacturerPart: "02031 - KIT, TRANSMISSION SERVICE 2-PART", incentive: 0 },
  { barePartNumber: "02041", manufacturerPart: "02041 - KIT, THROTTLE-BODY", incentive: 0 },
  { barePartNumber: "02161", manufacturerPart: "02161 - KIT, POWER-STEERING 2-PART", incentive: 0 },
  { barePartNumber: "02211", manufacturerPart: "02211 - KIT, PREMIUM OIL SERVICE", incentive: 0 },
  { barePartNumber: "02311", manufacturerPart: "02311 - KIT, DIESEL SERVICE 2-PART", incentive: 0 },
  { barePartNumber: "02381", manufacturerPart: "02381 - KIT, SILENT BRAKES, NFSC, 2-PART", incentive: 0 },
  { barePartNumber: "02661", manufacturerPart: "02661 - KIT, PREMIUM FUEL-SYSTEM SERVICE 3-PART", incentive: 0 },
  { barePartNumber: "02951", manufacturerPart: "02951 - ULTIMA POWER STEER FLUSH", incentive: 0 },
  { barePartNumber: "03111", manufacturerPart: "03111 - KIT, POWER-STEERING-RED 2-PART", incentive: 0 },
  { barePartNumber: "03381", manufacturerPart: "03381 - KIT, PREMIUM EFI, NFSC, 3-PART", incentive: 0 },
  { barePartNumber: "03471", manufacturerPart: "03471 - KIT, RAC,HEADLIGHT,PROFESSIONAL VERSION, 7-PART", incentive: 0 },
  { barePartNumber: "04116", manufacturerPart: "04116 - PREMIUM MULTI-VEHICLE SYNTHETIC ATF, 55 GAL", incentive: 0 },
  { barePartNumber: "04141", manufacturerPart: "04141 - GEAR GUARD 75W-90, 32OZ", incentive: 0 },
  { barePartNumber: "04147", manufacturerPart: "04147 - GEAR GUARD SAE 75W-90, 16GAL", incentive: 0 },
  { barePartNumber: "04203", manufacturerPart: "04203 - MULTI-VEHICLE ATF-BLUE, 1 GAL", incentive: 0 },
  { barePartNumber: "04213", manufacturerPart: "04213 - SYNTHETIC ATF HP, 1 GAL", incentive: 0 },
  { barePartNumber: "04281", manufacturerPart: "04281 - GEAR GUARD PLUS SAE 75W140, 32OZ", incentive: 0 },
  { barePartNumber: "04321", manufacturerPart: "04321 - ENHANCE, 16OZ", incentive: 0 },
  { barePartNumber: "04451", manufacturerPart: "04451 - COOLING SYSTEM PROTECTOR, 12OZ", incentive: 0 },
  { barePartNumber: "04481", manufacturerPart: "04481 - GDI FUEL INJECTOR CLEANER, 10OZ", incentive: 0 },
  { barePartNumber: "05301", manufacturerPart: "05301 - KIT, FRESH A/C & EVAP CLEANER 2-PART", incentive: 0 },
  { barePartNumber: "05401", manufacturerPart: "05401 - PRE-OWNED VEHICLE PROTECTION AUTOMATIC 5-PART", incentive: 0 },
  { barePartNumber: "05451", manufacturerPart: "05451 - KIT, FUEL&COMBUSTION CHAMBER CLEANER-LOW VOC 3-PART", incentive: 0 },
  { barePartNumber: "05481", manufacturerPart: "05481 - KIT, PRE-OWNED PROTECTION, AUTOMATIC 4-PART", incentive: 0 },
  { barePartNumber: "05561", manufacturerPart: "05561 - KIT, PREM FUEL &COMBUSTION CHAMBER CLEAN, NFSC, 3-PART", incentive: 0 },
  { barePartNumber: "05581", manufacturerPart: "05581 - EV BRAKE SERVICE 3PK", incentive: 0 },
  { barePartNumber: "05601", manufacturerPart: "05601 - KIT, EV/HEV QUIET BRAKE SERVICE 5-PART", incentive: 0 },
  { barePartNumber: "05791", manufacturerPart: "05791 - KIT, EXTENDED OIL LIFE", incentive: 0 },
  { barePartNumber: "05871", manufacturerPart: "05871 - KIT, PREMIUM COOLANT PROTECTION 2-PART", incentive: 0 },
  { barePartNumber: "05921", manufacturerPart: "05921 - ACTIVE ENGINE CLEANING, 6 - 32OZ BOTTLES", incentive: 0 },
  { barePartNumber: "05951", manufacturerPart: "05951 - KIT, HEV PERFORMANCE, 3 - 10OZ BOTTLES", incentive: 0 },
  { barePartNumber: "06001", manufacturerPart: "06001 - BRAKE FLUID, DOT 3 - HEAVY DUTY, 53OZ", incentive: 0 },
  { barePartNumber: "06021", manufacturerPart: "06021 - BRAKE FLUID, DOT 5.1 - ULTRA, 53 OZ", incentive: 0 },
  { barePartNumber: "06022", manufacturerPart: "06022 - BRAKE FLUID, DOT 5.1 - ULTRA 32 OZ", incentive: 0 },
  { barePartNumber: "06121", manufacturerPart: "06121 - ULTIMA POWER STEERING FLUID, 1/2GAL", incentive: 0 },
  { barePartNumber: "06172", manufacturerPart: "06172 - ELECTRIC POWER-STEERING FLUID, 32OZ", incentive: 0 },
  { barePartNumber: "10131", manufacturerPart: "10131 - PREMIUM THROTTLE BODY, NFSC, 4.5OZ", incentive: 0 },
  { barePartNumber: "10381", manufacturerPart: "10381 - BRAKE & PARTS WASH NON-CHLOR, NFSC, 13OZ", incentive: 0 },
  { barePartNumber: "10501", manufacturerPart: "10501 - AEROSOL, A/C ODOR TREATMENT, 5OZ AEROSOL", incentive: 0 },
  { barePartNumber: "10881", manufacturerPart: "10881 - FUEL INJECTOR FLUSH, 10OZ AEROSOL", incentive: 0 },
  { barePartNumber: "61121", manufacturerPart: "61121 - CLEAN TABS", incentive: 0 },
  { barePartNumber: "61141", manufacturerPart: "61141 - ALL-SEASON WASHER SOLVENT, 11OZ", incentive: 0 },
];

// ── DEALER ALIASES ───────────────────────────────────────────────────────────
// Real dealer DMS names observed across 349 entries from 20+ dealers.
// Used in Pass 2.5 (name pre-match) and to enrich AI prompt context.
// Format: barePartNumber -> array of normalized dealer name strings
const DEALER_ALIASES = {
  "01071": ["E SHIELD", "E-SHELD", "E-SHIELD", "E-SHIELD 80Z", "E-SHIELD 8OZ", "ESHIELD"],
  "01121": ["FUEL INJ FLUSH 12OZ", "FUEL INJECTOR F"],
  "01161": ["KIT RADIATOR FLUSH 2"],
  "01211": ["ENG TREATMENT 11OZ", "OIL COND", "OIL CONDITIONER", "PREM ENGINE TRE", "PREMIUM ENGINE", "PREMIUM ENGINE TR", "PREMIUM ENGINE TREATME", "PREMIUM ENGINE TREATMENT", "PREMIUM ENGINE TREATMENT 11OZ", "PREMIUM ENGINE TREATMENT, 11OZ", "PREMIUM MOTOR OIL CONDITIONER"],
  "01221": ["PREMIUM DIESEL ENGINE TREATMENT, 11OZ"],
  "01222": ["DIES TREAT", "PREMIUM DIESEL ENGINE TREATMENT"],
  "01241": ["MULTI CLEAN", "MULTI CLEAN MAX", "MULTI-CLEAN 11OZ", "MULTI-CLEAN MAX", "MULTI-CLEAN MAX 11OZ", "MULTI-CLEAN MAX, 11 OZ", "MULTICLEAN"],
  "01291": ["FUEL GUARD", "OREMIUM FUEL GUAR", "PREM FUEL GUARD", "PREMIUM FUEL GARD", "PREMIUM FUEL GUARD", "PREMIUM FUEL GUARD 10OZ", "PREMIUM FUEL GUARD,", "PREMIUM FUEL GUARD, 10OZ"],
  "01401": ["KIT,QUIET BRAKES", "QUIET BRAKE"],
  "01441": ["DIES PURGE", "DIESEL PURGE", "DIESEL PURGE 12OZ"],
  "01451": ["ADVANCED DIESEL TREATMENT", "ADVANCED DIESEL TREATMENT 12OZ", "DIES TREAT"],
  "01601": ["8OZ RODENT DET", "BANISH", "BANISH RODENT", "BANISH RODENT 8OZ", "BANISH RODENT DETERREN", "BANISH RODENT DETERRENT", "BANISH RODENT DETERRENT 8OZ", "BANISH!RODENT DETERRENT", "BANISH, RODENT DETERRENT", "BANISH,RODENT DETERRENT 8OZ"],
  "01901": ["KIT, QUIET BRAKES, 2-PART", "QUIET BRAKES", "QUIET BRAKES KIT-2 PART"],
  "01941": ["KIT ATF 2 PART CLEAN"],
  "02271": ["USED CAR KIT"],
  "02321": ["FUEL SYSTEM SERVICE"],
  "02871": ["BATT KIT", "BATT SERVICE", "BATTERY KIT", "BATTERY SERVICE", "BATTERY SERVICE K", "BATTERY SERVICE KIT", "BATTERY SERVICE KIT-2 PART", "KIT BATTERY", "KIT,BATTERY SERVICE"],
  "02911": ["BRITE H/L REST"],
  "03451": ["3PT PRE BRAKE FLUID", "KIT, PREMIUM BRAKE FLUID & LUBE 3PA", "KIT, PREMIUM BRAKE FLUID & LUBE 3PART", "KIT,3PART BRAKEFLUID&LUBE", "KIT,PREMIUM BRAKE FLUID 3 PART", "KIT,PREMIUM BRAKE FLUID&LUBE,3 PART", "PRE BRAKE FLUID", "PREM BRAKE AND LUBE KIT", "PREM BRAKE FLUID/", "PREMIUM BRAKE FLUID & LUBE KIT", "PREMIUM BRAKE FLUID&LUBE"],
  "03461": ["KIT PREMIUM BRAKE CALIPER LUBE 2-PART", "PREMIUM BRAKE CALIPER LUBE KIT", "PREMIUM BRAKE CALIPER LUBE, 2PART", "TECH GR POWER STE"],
  "03771": ["POWER STEERING", "TECH GRADE POWER STEERING KIT", "TECH-GRADE P/S KIT 2PK"],
  "04113": ["MULTI SYN ATF", "MULTI VEHICLE SYN ATF", "MULTI-VEHICLE SYN ATF", "SYN ATF 1 GAL", "SYN ATF MULTI-VEHICLE", "SYNTHETIC ATF 1GAL"],
  "04114": ["TRANSMISSION FLUID"],
  "04133": ["ATF LV", "ATF LV 1 GAL", "PREM ATF 1 GAL"],
  "04152": ["ULTRA SHIFT", "ULTRA SHT"],
  "04172": ["MULTI SYNTHETIC C", "MULTI-VEHICLE CVT FLUID"],
  "04181": ["CVT CONDITIONER", "UNIV CVT COND 11O", "UNIVERSAL CVT CONDITIONER"],
  "04211": ["MOC SYNTHETIC ATF HP"],
  "04271": ["75W90 GEAR PLUS", "75W90 LUBE", "GEAR GUARD 75/90W 32OZ", "GEAR GUARD 75W9", "GEAR GUARD PLUG 75W-90, 32OZ", "GEAR GUARD PLUS 75W-90", "GEAR GUARD PLUS 75W90", "GEAR GUARD PLUS75W90", "GEAR GUARD75/90"],
  "04421": ["MP BOOST 10OZ", "BOOST", "BOOST FUEL SYSTEM CLEANER", "MP BOOST", "MP BOOST 10OZ"],
  "04441": ["MP PROTECT COOLING SYSTEM PROTECTION 10OZ", "MPPROTECT COOLING SYS PROT 10OZ", "MPPROTECT COOLING SYSTEM PROTECT", "COOL PROT", "COOLING SYS PRO", "COOLING SYS PROTECT", "COOLING SYSTEM PRO", "COOLING SYSTEM PROTEC", "COOLING SYSTEM PROTECTIOIN", "COOLING SYSTEM PROTECTION", "COOLING SYSTEM PROTECTION 10OZ", "MP PROTECT COOLING", "MP PROTECT COOLING SYS", "MP PROTECT COOLING SYS PROTECTION", "MP PROTECT COOLING SYSTEM 10OZ", "MP PROTECT COOLING SYSTEM PROTECTION", "MP PROTECTOR"],
  "04461": ["12OZ SHYFT", "MP SHYFT", "SHYFT", "SHYFT 12OZ", "SHYFT,12OZ"],
  "05591": ["EV/HV PREMIUM BRAKE KI"],
  "06002": ["BRAKE FLUID 32OZ", "BRAKE FLUID DOT 3", "BRAKE FLUID DOT 3 HD", "BRAKE FLUID, DOT 3 - HEAVY DUTY, 32OZ"],
  "06011": ["DOT 4 BRAKE FLUID 53OZ"],
  "06012": ["BRAKE FLUID", "BRAKE FLUID DOT 4 HEAV", "BRAKE FLUID DOT4", "BRAKE FLUID DOT4 32OZ", "BRAKE FLUID MOC 32OZ", "BRAKE FLUID, DOT 4 - HEAVY DUTY, 32OZ", "BRAKE FLUID- DOT 4", "DOT 4 BRAKE FLUID", "DOT 4 BRAKE FLUID 32OZ", "DOT4 FLUID"],
  "06181": ["POWER STEERING FLUID 1/2 GAL", "TECH-GRADE POWER STEERING FLUID"],
  "06201": ["ARCTIC BLAST", "ARCTICBLAST", "ARCTICBLAST 1 USE", "ARCTICBLAST 10ML", "ARTIC BLAST", "ARTICBLAST"],
  "06571": ["ADVANCED DIESEL TREATMENT", "ADVANCED ENGINE TREATMENT"],
  "10081": ["PARTS WASH"],
  "10431": ["AEROSOL THROTTLE BODY&", "T/BODY CLEAN", "TBI AND AIR INTAKE CLEANER", "THR CLEANER", "THROTTLE BODY", "THROTTLE BODY & AIR INT", "THROTTLE BODY & AIR INTAKE CLEANER", "THROTTLE BODY CLEANER", "TROT/BODY CLEANER"],
  "10507": ["A/C FRESH", "A/C FRESH 2 OZ", "AC DEODORIZER", "AC FRESH", "AC ODER TREATMENT", "AC ODOR TREATMENT", "FRESH A/C", "FRESH A/C 2OZ", "FRESH A/C, 2OZ", "MOC A/C DEODORIZER"],
  "10521": ["EVAP CORE CLEANER", "EVAPORATOR CORE CLEANER"],
  "10951": ["MAF CLEAN", "MASS A/F CLEAN", "MASS AIR FLOW CLEANER", "MASS AIR FLOW SEN", "MASS AIR FLOW SENSOR CLEANER"],
  "10971": ["AEROLSOL, CHARGE PORT CLEANER, 2OZ", "AEROSOL CHARGE PORT CLEANER", "AEROSOL, CHARGE PORT CLEANER 2OZ", "AEROSOL,CHARGE PORT CLEANER 2OZ", "AERSOL CHARGE PORT CLEANER 2OZ", "CHARGE PORT", "CHARGE PORT CLEANER", "CHARGE PORT CLEANER 2OZ", "CHARGE PORT CLN", "CHARGEPORT CLEANER", "CHG PORT"],
  "16501": ["FUEL OPTIMIZER", "MOC OPTIMIZER", "OPTIMIZER", "OPTIMIZER 13OZ", "OPTIMIZER AEROSOL 13OZ"],
  "61131": ["WASHER FLUID", "WASHER FLUID 8OZ", "WASHER SOLVENT", "WASHERSOLV", "WINDSHIELD WASHER", "WINDSHIELD WASHER FLUID", "WINDSHIELD WASHER SOLVE", "WINDSHIELD WASHER SOLVEN", "WINDSHIELD WASHER SOLVENT 8OZ", "WINDSHIELD,WASH 8OZ", "WINDSHIELD-WASHER SOLVENT", "WSR SOLV"],
  "62941": ["GLASS KIT", "GLASS TREAT", "MOC VISION GLASS TREATMENT", "MP VISION", "MP VISION GLASS T", "MP VISION GLASS TREAM", "MP VISION GLASS TREATM", "MP VISION GLASS TREATMENT", "MP VISION GLASS TREATMENT KIT", "MP VISION, KIT GLASS TREATMENT, 5-PART", "VISION GLASS TR"],
  "62951": ["MP VISION, KIT GLASS TREATMENT"],
};

// ── DMS PREFIX STRIPPING ──────────────────────────────────────────────────────
// DMS systems prepend various prefixes to the canonical 5-digit MOC part number.
// Known formats observed across dealers:
//   R&R (Reynolds & Reynolds): TO01071, SU01071  — 2+ letter make code
//   R&R with branding:         TOMP01071          — 4-letter make+brand code
//   CDK:                       01071              — no prefix (bare numeric)
//   PBS / other:               A01071             — single letter prefix
//   Custom:                    MOC01071           — 3-letter prefix
//
// One file = one dealer = one DMS. DMS type detected ONCE at file-parse time.
// Strategy: strip any leading alphabetic characters, zero-pad remaining digits to 5.
// ── R&R MAKE CODE WHITELIST ──────────────────────────────────────────────────
// These are the ONLY valid R&R prefixes. This list is definitive — sourced from
// the Make_code_repository. Any prefix not on this list is NOT a make code.
// CDK files never have prefixes — stripping is completely disabled for CDK.
const RR_MAKE_CODES = new Set(["SU","TO","MB","FO","HP","GN","CH","KI","GM","LE"]);

// Some R&R dealers add "MP" after the make code for MOC-branded setups (e.g. TOMP01071).
// Pattern: [MAKE CODE] + optional "MP" + digits
// e.g. TO01071, TOMP01071, SU06002 — all valid R&R formats
function parseSKU(rawSku, fileDmsType) {
  const sku = String(rawSku).trim().toUpperCase();

  // CDK: zero stripping, ever. Full SKU is the part number exactly as exported.
  if (fileDmsType === "CDK") {
    return { makeCode: null, barePartNumber: sku, dmsType: "CDK" };
  }

  // R&R: try each known make code as a prefix
  for (const code of RR_MAKE_CODES) {
    if (!sku.startsWith(code)) continue;
    const afterCode = sku.slice(code.length);

    // Standard: MAKE + digits only (e.g. TO01071)
    if (/^\d+$/.test(afterCode)) {
      return { makeCode: code, barePartNumber: afterCode.padStart(5, "0"), dmsType: "R&R" };
    }
    // Branded: MAKE + "MP" + digits only (e.g. TOMP01071)
    if (afterCode.startsWith("MP") && /^\d+$/.test(afterCode.slice(2))) {
      return { makeCode: code + "MP", barePartNumber: afterCode.slice(2).padStart(5, "0"), dmsType: "R&R" };
    }
  }

  // No known make code matched — this is not a recognized R&R prefix format.
  // Preserve the full SKU so structural analysis can correctly flag it.
  return { makeCode: null, barePartNumber: sku, dmsType: "R&R" };
}

// ── STRUCTURAL SIGNAL ─────────────────────────────────────────────────────────
// MOC parts are almost always 5-digit numeric, often with a leading zero.
// This is a weighted prior, not a verdict.
function analyzeMOCStructure(barePartNumber) {
  const s = String(barePartNumber).trim();
  const allDigits = /^\d+$/.test(s);

  // Single-letter prefix + 5-digit number = R&R make-code format (e.g. M02421, A04461)
  // Treat identically to a bare 5-digit number — the prefix is just a DMS store code
  const singleLetterPrefix = /^[A-Z](\d{5})$/i.exec(s);
  if (singleLetterPrefix) {
    const digits = singleLetterPrefix[1];
    return digits.startsWith("0")
      ? { score: 2, label: "STRONG",   detail: "Single-letter prefix + 5-digit number — R&R make-code format with leading zero (e.g. M02421, A04461)" }
      : { score: 1, label: "POSSIBLE", detail: "Single-letter prefix + 5-digit number — R&R make-code format (e.g. M02421)" };
  }

  // Any other non-digit characters = complex OEM part number, never MOC
  if (!allDigits)
    return { score: 0, label: "UNLIKELY", detail: "Mixed alphanumeric — OEM part number, not MOC format" };
  if (s.length === 5 && s.startsWith("0"))
    return { score: 2, label: "STRONG",   detail: "5-digit numeric with leading zero — matches MOC pattern closely" };
  if (s.length === 5)
    return { score: 1, label: "POSSIBLE", detail: "5-digit numeric — consistent with MOC part structure" };
  // 4-digit all-numeric — likely a MOC number with dropped leading zero
  if (s.length === 4)
    return { score: 1, label: "POSSIBLE", detail: "4-digit numeric — likely MOC number with dropped leading zero (e.g. 2301 → 02301)" };
  // Wrong digit count
  return { score: 0, label: "UNLIKELY", detail: s.length + "-digit numeric — MOC parts are 5 digits" };
}

const CONFIDENCE_COLORS = {
  HIGH:   { bg: "#0a2e1a", text: "#22c55e", border: "#16a34a" },
  MEDIUM: { bg: "#2a1e05", text: "#f59e0b", border: "#d97706" },
  LOW:    { bg: "#2a0a0a", text: "#f87171", border: "#dc2626" },
  EXACT:  { bg: "#0a1a2e", text: "#60a5fa", border: "#2563eb" },
};

export default function MOCMatcher() {
  const [partsFile,       setPartsFile]       = useState(null);
  const [parsedParts,     setParsedParts]     = useState([]);
  const [fileDms,         setFileDms]         = useState(null);
  const [results,         setResults]         = useState([]);
  const [status,          setStatus]          = useState("idle");
  const [progress,        setProgress]        = useState(0);
  const [errorMsg,        setErrorMsg]        = useState("");
  const [dragOver,        setDragOver]        = useState(false);
  const [dealerBrand,     setDealerBrand]     = useState("all"); // "toyota" | "all"
  const [filter,          setFilter]          = useState("all");
  // Approved dealer mappings — persisted across sessions via window.storage.
  // Each entry: { dmsSku, dmsPartName, barePartNumber, manufacturerPart, incentive, approvedAt }
  const [approvedMappings,  setApprovedMappings]  = useState([]);
  // Queue of newly matched parts awaiting approval after a run
  const [approvalQueue,     setApprovalQueue]     = useState([]);
  // Custom archetypes added by user — extends MOC_MAPPINGS at runtime
  // Each entry: { barePartNumber, manufacturerPart, incentive, addedAt }
  const [customArchetypes,  setCustomArchetypes]  = useState([]);
  // Add archetype form state
  const [showAddForm,       setShowAddForm]       = useState(false);
  const [newPartNumber,     setNewPartNumber]     = useState("");
  const [newPartName,       setNewPartName]       = useState("");
  const [newIncentive,      setNewIncentive]      = useState("");
  // editingArchetypeIdx: index into customArchetypes being edited, null = adding new
  const [editingArchetypeIdx, setEditingArchetypeIdx] = useState(null);
  // Cancel token for in-progress matching run
  const cancelRef = useRef(false);
  // Inline add-archetype form state for result rows (UNMATCHED / LOW confidence)
  const [rowForm, setRowForm] = useState(null); // null or { idx, partNumber, partName, incentive }
  const [accuracyLog, setAccuracyLog] = useState([]); // [{ category, outcome, ts }]
  const [accuracyAlert, setAccuracyAlert] = useState(null); // null or message string
  const [blockedSkus, setBlockedSkus] = useState([]);
  const [dealerName, setDealerName] = useState("");       // extracted from filename or manual override
  const [dealerNameManual, setDealerNameManual] = useState(false); // true if user edited it
  const [dealerRejections, setDealerRejections] = useState({});
  const [selectedQueue, setSelectedQueue] = useState(new Set());
  const [runHistory, setRunHistory] = useState([]);
  const [sessionRejected, setSessionRejected] = useState(new Set());
  const [mappingsExportData, setMappingsExportData] = useState(null); // SKUs NO'd this session // [{ date, dealer, total, exact, exactPct }] // indices of selected queue items // { "dealer_name": ["SKU1","SKU2",...] }
  const [pinPrompt, setPinPrompt] = useState(null);   // { idx, sku } when PIN dialog open
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState(false);
  // Correct match form — tracks which queue row is being corrected
  const [correctingIdx,     setCorrectingIdx]     = useState(null);
  const [correctArchetype,  setCorrectArchetype]  = useState("");

  // aliasEntries: rich alias store with metadata for auditability
  // { barePartNumber -> [{ name, sourceSku, origin, addedAt }, ...] }
  // origin: "approved" (user approved) | "exact_auto" (auto-captured from exact match)
  const [aliasEntries, setAliasEntries] = useState({});

  // Flat dynamicAliases derived from aliasEntries — used for AI prompt and mergedAliases
  const dynamicAliases = Object.fromEntries(
    Object.entries(aliasEntries).map(([bare, entries]) => [bare, entries.map(e => e.name)])
  );

  // Load both approvedMappings and dynamicAliases from persistent storage on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await window.storage.get("approvedMappings");
        if (stored && stored.value) setApprovedMappings(JSON.parse(stored.value));
      } catch { /* no stored mappings yet */ }
      try {
        // One-time migration: convert old flat dynamicAliases -> rich aliasEntries
        const oldStore = await window.storage.get("dynamicAliases").catch(() => null);
        if (oldStore && oldStore.value) {
          const flat = JSON.parse(oldStore.value); // { bare -> [name, name, ...] }
          const migrated = {};
          for (const [bare, names] of Object.entries(flat)) {
            if (Array.isArray(names)) {
              migrated[bare] = names.map(name => ({
                name:      String(name).trim().toUpperCase(),
                sourceSku: "",
                origin:    "approved",
                addedAt:   new Date().toISOString(),
              }));
            }
          }
          await window.storage.set("aliasEntries", JSON.stringify(migrated)).catch(() => {});
          await window.storage.delete("dynamicAliases").catch(() => {});
          setAliasEntries(migrated);
        } else {
          // Normal load from aliasEntries
          const stored = await window.storage.get("aliasEntries");
          if (stored && stored.value) setAliasEntries(JSON.parse(stored.value));
        }
      } catch { /* no stored aliases yet */ }
      try {
        const stored = await window.storage.get("deferredMappings");
        if (stored && stored.value) {
          const deferred = JSON.parse(stored.value);
          setApprovalQueue(deferred.map(r => ({ ...r, approved: null })));
        }
      } catch { /* no deferred items yet */ }
      try {
        const stored = await window.storage.get("customArchetypes");
        if (stored && stored.value) setCustomArchetypes(JSON.parse(stored.value));
      } catch { /* no custom archetypes yet */ }
      try {
        const stored = await window.storage.get("accuracyLog");
        if (stored && stored.value) setAccuracyLog(JSON.parse(stored.value));
      } catch {}
      try {
        const stored = await window.storage.get("blockedSkus");
        if (stored && stored.value) setBlockedSkus(JSON.parse(stored.value));
      } catch {}
      try {
        const stored = await window.storage.get("dealerRejections");
        if (stored && stored.value) setDealerRejections(JSON.parse(stored.value));
      } catch {}
      try {
        const stored = await window.storage.get("runHistory");
        if (stored && stored.value) setRunHistory(JSON.parse(stored.value));
      } catch { /* no custom archetypes yet */ }
    })();
  }, []);

  // All archetypes = hardcoded MOC_MAPPINGS + user-added custom archetypes
  // Strip trademark symbols from all archetype names so they match DMS names cleanly
  const allMappings = [...MOC_MAPPINGS, ...customArchetypes].map(m => ({
    ...m,
    manufacturerPart: m.manufacturerPart.replace(/[™®©]/g, "").trim(),
  }));

  // Merge hardcoded DEALER_ALIASES with dynamicAliases into a single lookup.
  // Result: { barePartNumber -> array of unique name strings }
  const mergedAliases = (() => {
    const merged = {};
    for (const [bare, names] of Object.entries(DEALER_ALIASES)) {
      merged[bare] = new Set(names);
    }
    for (const [bare, names] of Object.entries(dynamicAliases)) {
      if (!merged[bare]) merged[bare] = new Set();
      for (const n of names) merged[bare].add(n);
    }
    // Convert Sets back to sorted arrays
    const result = {};
    for (const [bare, set] of Object.entries(merged)) result[bare] = [...set].sort();
    return result;
  })();

  const parseExcel = useCallback((file) => {
    setStatus("parsing");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb      = XLSX.read(e.target.result, { type: "binary" });
        const ws      = wb.Sheets[wb.SheetNames[0]];
        const rows    = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const headers = rows[0];
        const skuIdx  = headers.findIndex(h => String(h).toUpperCase().includes("SKU"));
        const nameIdx = headers.findIndex(h => String(h).toUpperCase().includes("PART NAME"));

        if (skuIdx === -1 || nameIdx === -1) {
          setErrorMsg("Could not find SKU or Part Name columns in the file.");
          setStatus("error");
          return;
        }

        // FILE-LEVEL DMS DETECTION — one file = one dealer = one DMS
        // Sample first 20 SKUs. Alphabetic prefix = R&R; pure numeric = CDK.
        const sample = [];
        for (let i = 1; i < rows.length && sample.length < 20; i++) {
          const s = rows[i][skuIdx];
          if (s) sample.push(String(s).trim().toUpperCase());
        }
        let rrVotes = 0, cdkVotes = 0;
        for (const s of sample) {
          if (/^[A-Z]+\d/.test(s)) rrVotes++; else cdkVotes++;
        }
        const fileDmsType = rrVotes > cdkVotes ? "R&R" : "CDK";
        setFileDms(fileDmsType);

        // Parse all unique parts
        const seen   = new Set();
        const unique = [];
        for (let i = 1; i < rows.length; i++) {
          const sku  = rows[i][skuIdx];
          const name = rows[i][nameIdx];
          if (!sku || seen.has(String(sku).trim())) continue;
          seen.add(String(sku).trim());
          const parsed     = parseSKU(String(sku).trim(), fileDmsType);
          const structural = analyzeMOCStructure(parsed.barePartNumber);
          unique.push({
            sku:            String(sku).trim(),
            partName:       name ? String(name).trim().replace(/[™®©]/g, "").trim() : "",
            makeCode:       parsed.makeCode,
            barePartNumber: parsed.barePartNumber,
            dmsType:        fileDmsType,
            structural,
          });
        }
        setParsedParts(unique);
        setPartsFile(file.name);
        // Auto-extract dealer name from filename: everything before _warranty
        if (!dealerNameManual) {
          const base    = file.name.replace(/\.[^.]+$/, ""); // strip extension
          const match   = base.match(/^(.+?)_warranty/i);
          const extracted = match ? match[1].replace(/_/g, " ").trim() : "";
          setDealerName(extracted);
        }
        setStatus("ready");
      } catch (err) {
        setErrorMsg("Failed to parse Excel file: " + err.message);
        setStatus("error");
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  const handleDrop      = useCallback((e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseExcel(f); }, [parseExcel]);
  const handleFileInput = useCallback((e) => { const f = e.target.files[0]; if (f) parseExcel(f); }, [parseExcel]);

  // Derive tracking category from a queue item
  const getMatchCategory = (item) => {
    const mt   = item.matchType || "UNMATCHED";
    const conf = item.confidence || "";
    if (mt === "EXACT")  return "EXACT";
    if (mt === "FUZZY")  return conf === "HIGH" ? "FUZZY_HIGH" : "FUZZY_MEDIUM";
    if (mt === "AI")     return conf === "HIGH" ? "AI_HIGH" : conf === "MEDIUM" ? "AI_MEDIUM" : "AI_LOW";
    return "OTHER";
  };

  // Log an accuracy event and check milestone alerts
  const logAccuracy = async (item, outcome, currentLog) => {
    const category = getMatchCategory(item);
    const entry    = { category, outcome, ts: new Date().toISOString() };
    const updated  = [...currentLog, entry];
    setAccuracyLog(updated);
    try { await window.storage.set("accuracyLog", JSON.stringify(updated)); } catch {}

    // Check milestones per category — alert at 100 and 500 with 99%+ accuracy
    const catEntries  = updated.filter(e => e.category === category);
    const total       = catEntries.length;
    const approvals   = catEntries.filter(e => e.outcome === "approved").length;
    const accuracy    = total > 0 ? approvals / total : 0;

    // Read alert history to avoid duplicate alerts
    let alertHistory = {};
    try {
      const s = await window.storage.get("accuracyAlerts");
      if (s && s.value) alertHistory = JSON.parse(s.value);
    } catch {}

    const milestones = [100, 500];
    for (const milestone of milestones) {
      const key = category + "_" + milestone;
      if (!alertHistory[key] && total >= milestone && accuracy >= 0.99) {
        alertHistory[key] = new Date().toISOString();
        try { await window.storage.set("accuracyAlerts", JSON.stringify(alertHistory)); } catch {}
        setAccuracyAlert(
          category.replace("_", " ") + " has reached " + milestone +
          " decisions at " + (accuracy * 100).toFixed(1) + "% accuracy — ready to review for automation."
        );
        break; // Only one alert at a time
      }
    }
    return updated;
  };

  const handleRowAddArchetype = async () => {
    if (!rowForm) return;
    const bare = String(rowForm.partNumber).trim().replace(/^0+/, "").padStart(5, "0");
    const name = rowForm.partName.trim().toUpperCase();
    if (!bare || !name) return;
    const fullName = bare + " - " + name;
    const entry = {
      barePartNumber:   bare,
      manufacturerPart: fullName,
      incentive:        parseFloat(rowForm.incentive) || 0,
      addedAt:          new Date().toISOString(),
    };
    const updatedArchetypes = [...customArchetypes, entry];
    setCustomArchetypes(updatedArchetypes);
    try { await window.storage.set("customArchetypes", JSON.stringify(updatedArchetypes)); }
    catch (e) { console.error("Custom archetype save failed", e); }

    // Re-evaluate the specific result row immediately
    setResults(prev => prev.map((r, i) => {
      if (i !== rowForm.idx) return r;
      // Check if this row now matches the new archetype
      const rowCore    = String(r.barePartNumber).replace(/\D/g, "").replace(/^0+/, "") || "0";
      const entryCore  = bare.replace(/^0+/, "") || "0";
      const directHit  = r.barePartNumber === bare || rowCore === entryCore;
      if (directHit) {
        return {
          ...r,
          matchType:        "EXACT",
          matchedArchetype: fullName,
          matchedPartNumber: bare,
          confidence:       "HIGH",
          reason:           "Matched new archetype " + bare + " added from this row",
          incentive:        parseFloat(rowForm.incentive) || 0,
        };
      }
      return r;
    }));

    setRowForm(null);
  };

  const handleClearFile = () => {
    if (status === "matching") return;
    setPartsFile(null); setParsedParts([]); setFileDms(null);
    setResults([]); setStatus("idle");
    setDealerName(""); setDealerNameManual(false);
    const input = document.getElementById("file-input");
    if (input) input.value = "";
  };

  const handleCancelRun = () => { cancelRef.current = true; };

  const runMatching = async () => {
    cancelRef.current = false;
    setStatus("matching");
    setProgress(0);
    setResults([]);
    try {

    const exactMatched  = [];
    const fuzzyMatched  = [];
    const toAIMatch     = [];

    // Strips all non-digit characters then removes leading zeros.
    // Used to compare numeric cores regardless of dashes, suffixes, or formatting.
    // e.g. "01-071A" → "1071",  "06002" → "6002",  "MOC06002" already stripped → "6002"
    const numericCore = (s) => String(s).replace(/[^0-9]/g, "").replace(/^0+/, "") || "0";
    const mappingCores = allMappings.map(m => ({ ...m, core: numericCore(m.barePartNumber) }));

    // PASS 1 — Exact match: first check approved dealer mappings (SKU-level),
    // then fall back to canonical MOC bare part number match.
    // NAME DIVERGENCE GUARD: tokenise a DMS part name for overlap comparison
    // Revert instructions: remove this function + the overlap check below, restore direct auto-match
    const nameTokens = (name) => {
      const STOP = new Set(["the","a","an","and","or","of","to","in","for","with","is","it","as","at","by","kit","moc"]);
      return new Set(
        String(name).toUpperCase().split(/[\s\/,\-&.]+/)
          .filter(w => w.length >= 3 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w))
      );
    };
    const nameOverlap = (n1, n2) => {
      const t1 = nameTokens(n1), t2 = nameTokens(n2);
      if (!t1.size || !t2.size) return 1; // if either name is empty, don't penalise
      return [...t1].filter(w => t2.has(w)).length;
    };

    // Approved mappings are dealer-specific SKUs previously confirmed by a human reviewer.
    const afterExact = [];
    for (const part of parsedParts) {
      // Check approved dealer SKU mappings first (highest specificity)
      const approvedMatch = approvedMappings.find(a =>
        a.dmsSku.toUpperCase() === part.sku.toUpperCase()
      );
      if (approvedMatch) {
        // NAME DIVERGENCE GUARD: if current name shares zero words with stored name,
        // send to queue instead of auto-matching — catches wrong part on same SKU number
        const overlap = nameOverlap(part.partName || "", approvedMatch.dmsPartName || "");
        if (overlap === 0) {
          afterExact.push({
            ...part,
            _divergenceHint: approvedMatch.manufacturerPart,
            _divergenceReason: `Name divergence: stored "${approvedMatch.dmsPartName}" vs current "${part.partName}" — queued for review`,
          });
          continue;
        }
        exactMatched.push({
          ...part, matchType: "EXACT",
          matchedArchetype:  approvedMatch.manufacturerPart,
          matchedPartNumber: approvedMatch.barePartNumber,
          confidence: "EXACT",
          reason: "Previously approved dealer mapping",
          incentive: approvedMatch.incentive || 0,
        });
        continue;
      }
      // Standard canonical MOC bare part number match
      const mapping = allMappings.find(m => m.barePartNumber === part.barePartNumber);
      if (mapping) {
        exactMatched.push({
          ...part, matchType: "EXACT",
          matchedArchetype: mapping.manufacturerPart,
          matchedPartNumber: mapping.barePartNumber,
          confidence: "EXACT",
          reason: "Bare part number " + part.barePartNumber + " directly matches MOC archetype",
          incentive: mapping.incentive,
        });
      } else {
        afterExact.push(part);
      }
    }

    // PASS 2 — Fuzzy numeric match (three sub-strategies)
    //
    // 2a. Numeric core match — strips all non-digit chars and compares.
    //     Catches: dashes ("01-071"), letter suffixes ("01071A"), dropped leading zeros ("6002")
    //
    // 2b. Trailing suffix match — checks if the last 4 or 5 digits of the number match a MOC archetype.
    //     Catches: store-prefix formats like "8888804461" where the dealer prepends their store
    //     number to the MOC part number. Last 5 digits "04461" → SHYFT match.
    //
    // 2c. Embedded match — checks if any known MOC bare part number appears as a substring.
    //     Catches: any other prefix/suffix wrapping around the MOC number.

    // ── MECHANICAL NAME DETECTION ─────────────────────────────────────────────
    // Uses compound OEM phrases rather than single words — avoids false flags on
    // MOC product names that contain ambiguous words (GEAR GUARD, SENSOR CLEANER, etc.)
    //
    // MOC_SAFE_PHRASES: built from 349 real dealer entries + canonical names.
    // If ANY safe phrase matches, the mechanical check is skipped entirely.
    //
    // MECHANICAL_COMPOUNDS: multi-word OEM patterns. A name must match one of these
    // to be flagged — single words like GEAR or GLASS alone are NOT sufficient.
    const MOC_SAFE_PHRASES = [
      "GEAR GUARD","GEAR PLUS","75W90 GEAR","CALIPER LUBE","BRAKE CALIPER LUBE",
      "SENSOR CLEANER","FLOW SENSOR","GLASS TREAT","GLASS KIT","VISION GLASS",
      "MP VISION GLASS","MOC VISION GLASS","GLASS TREATMENT",
    ];
    const MECHANICAL_COMPOUNDS = [
      // GEAR in OEM context
      "RING GEAR","GEAR BOX","GEAR ASSY","GEAR ASSEMBLY","GEAR SHAFT","GEAR SET",
      "GEAR CASE","BEVEL GEAR","GEAR RATIO","GEAR OIL",
      // GLASS in OEM context
      "DOOR GLASS","WINDOW GLASS","GLASS ASSY","GLASS ASSEMBLY","SIDE GLASS",
      "REAR GLASS","FRONT GLASS","BACK GLASS","WINDSHIELD GLASS",
      // SENSOR in OEM context
      "SPEED SENSOR","ABS SENSOR","O2 SENSOR","OXYGEN SENSOR","MAP SENSOR",
      "CAM SENSOR","CRANK SENSOR","TEMP SENSOR","KNOCK SENSOR","PRESSURE SENSOR",
      "SENSOR ASSY","SENSOR ASSEMBLY","PARK SENSOR","REVERSE SENSOR",
      // CALIPER in OEM context
      "CALIPER ASSY","CALIPER ASSEMBLY","BRAKE CALIPER","CALIPER BRACKET",
      // LAMP / LIGHT always OEM
      "LAMP:","PARK LAMP","TAIL LAMP","HEAD LAMP","HEADLAMP","FOG LAMP",
      "STOP LAMP","TURN LAMP","BACK LAMP","LAMP ASSY","LAMP ASSEMBLY",
      "SIGNAL LAMP","MARKER LAMP","LICENSE LAMP","LIGHT ASSY","LIGHT ASSEMBLY",
      // Other unambiguous OEM compounds
      "WIPER BLADE","WIPER ARM","WIPER MOTOR","BLADE ASSY",
      "BRAKE PAD","PAD KIT","PAD SET","DISC PAD",
      "AIR FILTER","OIL FILTER","FUEL FILTER","FILTER ASSY","CABIN FILTER",
      "TIMING BELT","DRIVE BELT","SERPENTINE BELT","V-BELT","BELT ASSY",
      "WATER PUMP","FUEL PUMP","OIL PUMP","PUMP ASSY",
      "CONTROL ARM","UPPER ARM","LOWER ARM","ARM ASSY",
      "CV AXLE","AXLE SHAFT","AXLE ASSY","HALF SHAFT",
      "SHOCK ABSORBER","STRUT ASSY","COIL SPRING","LEAF SPRING",
      "DOOR MIRROR","SIDE MIRROR","MIRROR ASSY","MIRROR GLASS",
      "TRIM PANEL","BODY TRIM","TRIM ASSY","MOLDING TRIM",
      "VALVE COVER","VALVE BODY","VALVE ASSY","EGR VALVE","PCV VALVE",
      "SEAL KIT","SEAL ASSY","OIL SEAL","GASKET KIT","HEAD GASKET",
      "HUB ASSY","WHEEL HUB","BEARING KIT","WHEEL BEARING",
    ];

    const isMechanicalName = (name) => {
      if (!name) return false;
      const upper = name.toUpperCase();
      // If any MOC-safe phrase matches, this is a known MOC product name — skip check
      if (MOC_SAFE_PHRASES.some(p => upper.includes(p))) return false;
      // Check for OEM compound phrases
      return MECHANICAL_COMPOUNDS.some(p => upper.includes(p));
    };

    // Score SKU complexity — determines confidence ceiling for fuzzy matches.
    // Returns: "clean" (HIGH eligible), "moderate" (MEDIUM), or "suspect" (LOW)
    const skuComplexity = (sku) => {
      const s = sku.toUpperCase();
      // All-numeric (store prefix formats like 8888804461)
      if (/^\d+$/.test(s)) return "clean";
      // Single letter or known make code prefix + pure digits (A04211, TO04181, TOMP01071)
      if (/^[A-Z]{1,4}\d+$/.test(s)) return "clean";
      // Letters on BOTH ends surrounding digits — sandwich pattern (68004181AC)
      if (/^[A-Z]+\d+[A-Z]+$/i.test(s)) return "suspect";
      // Long (8+ chars) with mixed letters and digits in complex pattern
      if (s.length >= 8 && /[A-Z]/.test(s) && /\d/.test(s)) return "suspect";
      // Anything else — moderate
      return "moderate";
    };

    // Filter blocked SKUs before fuzzy/AI passes — exact matches are never blocked
    const preExcluded = [];
    // Strip leading make-code prefix (letters only) to get SKU core for prefix-agnostic blocking
    // e.g. TO48068-02301 → 48068-02301, SU48068-02301 → 48068-02301, A04461 → 04461
    const stripPrefix  = (sku) => sku.toUpperCase().replace(/^[A-Z]+(?=\d)/, "");
    const blockedSet    = new Set(blockedSkus.map(b => b.sku.toUpperCase()));
    const blockedCores  = new Set(blockedSkus.map(b => stripPrefix(b.sku)));
    const dealerKey     = dealerName.trim().toLowerCase();
    const dealerNoSet   = new Set((dealerRejections[dealerKey] || []).map(s => s.toUpperCase()));
    const afterBlock = [];
    for (const part of afterExact) {
      const skuUp   = part.sku.toUpperCase();
      const skuCore = stripPrefix(part.sku);
      if (blockedSet.has(skuUp) || blockedCores.has(skuCore)) {
        preExcluded.push({
          ...part, matchType: "UNMATCHED",
          matchedArchetype: null, matchedPartNumber: null,
          confidence: null,
          reason: "SKU permanently blocked by admin — previously identified as non-MOC",
          incentive: null,
        });
      } else if (dealerNoSet.has(skuUp)) {
        preExcluded.push({
          ...part, matchType: "UNMATCHED",
          matchedArchetype: null, matchedPartNumber: null,
          confidence: null,
          reason: "Previously marked NO for this dealer — skipped",
          incentive: null,
        });
      } else {
        afterBlock.push(part);
      }
    }

    const afterFuzzy = [];
    for (const part of afterBlock) {
      const digits = part.barePartNumber.replace(/[^0-9]/g, "");
      const core   = numericCore(part.barePartNumber);
      let mapping  = null;
      let reason   = "";
      let matchPass = null; // "2a" or "2b" — used for confidence scoring

      // 2a: numeric core — only valid if no letters embedded between digits
      // Strip dashes before mid-letter check so segment-format OEM numbers like
      // 76620-T20-A01 are correctly detected. Without this, dashes break the regex
      // and letters between digit groups go undetected.
      const stripped       = part.barePartNumber.replace(/-/g, "");
      const hasMidLetters  = /\d[A-Z]+\d/i.test(stripped);
      const coreMatch = !hasMidLetters && mappingCores.find(m => m.core === core && core !== "0");
      if (coreMatch) {
        mapping   = coreMatch;
        matchPass = "2a";
        reason    = "Numeric core matches MOC " + mapping.barePartNumber + " after stripping formatting";
      }

      // 2b: trailing suffix — last 5 digits exactly match a MOC archetype
      if (!mapping && !hasMidLetters && digits.length > 5) {
        const tail5     = digits.slice(-5);
        const tailMatch = allMappings.find(m => m.barePartNumber === tail5);
        if (tailMatch) {
          mapping   = tailMatch;
          matchPass = "2b";
          reason    = "MOC number " + mapping.barePartNumber + " found as trailing suffix (store prefix stripped)";
        }
      }

      // 2c: zero-pad — if bare number is exactly 4 digits, prepend "0" and check.
      // Catches dealers who systematically drop the leading zero from MOC part numbers.
      // e.g. 2301 → 02301, 3381 → 03381, 2561 → 02561
      if (!mapping && /^\d{4}$/.test(part.barePartNumber)) {
        const padded    = "0" + part.barePartNumber;
        const padMatch  = allMappings.find(m => m.barePartNumber === padded);
        if (padMatch) {
          mapping   = padMatch;
          matchPass = "2c";
          reason    = "4-digit number zero-padded to " + padded + " — dealer likely dropping MOC leading zero";
        }
      }

      if (mapping) {
        // ── CONFIDENCE SCORING ──────────────────────────────────────────────
        // Start with a baseline based on match pass and SKU complexity,
        // then adjust based on name evidence.
        //
        // 2a + clean SKU  → HIGH baseline  (A04211, 8888804461 style)
        // 2a + moderate   → MEDIUM baseline
        // 2b (tail5)      → MEDIUM baseline (MOC number buried — inherently less certain)
        // Any + suspect   → LOW baseline   (letters sandwiching digits, long mixed format)
        // Name has mechanical terms → drop one level
        // Name matches MOC aliases  → hold level (no boost — fuzzy can't reach HIGH via name alone,
        //                              only a clean 2a match can be HIGH)

        const complexity  = skuComplexity(part.sku);
        const mechName    = isMechanicalName(part.partName);

        let confidence;
        if (complexity === "suspect") {
          confidence = "LOW";
        } else if (matchPass === "2b") {
          // Tail5 is inherently MEDIUM — MOC number is buried, more coincidence risk
          confidence = mechName ? "LOW" : "MEDIUM";
        } else if (matchPass === "2c") {
          // Zero-pad match — dealer dropped leading zero. Clean transformation, start MEDIUM.
          // Name evidence can keep it at MEDIUM but not raise to HIGH (one transformation removed).
          confidence = mechName ? "LOW" : "MEDIUM";
        } else {
          // 2a numeric core
          if (complexity === "clean") {
            confidence = mechName ? "MEDIUM" : "HIGH";
          } else {
            confidence = mechName ? "LOW" : "MEDIUM";
          }
        }

        if (mechName) reason += " (name contains mechanical terms — confidence lowered)";
        if (complexity === "suspect") reason += " (SKU structure suspect — letters on both ends or complex mixed format)";

        fuzzyMatched.push({
          ...part, matchType: "FUZZY",
          matchedArchetype:  mapping.manufacturerPart,
          matchedPartNumber: mapping.barePartNumber,
          confidence,
          reason,
          incentive: mapping.incentive,
        });
      } else {
        afterFuzzy.push(part);
      }
    }

    // PASS 3 — Pre-filter before AI
    // Hard-exclude confirmed OEM formats AND parts where the evidence is so clearly
    // negative that sending to AI would waste batch slots without changing the outcome.
    //
    // Skip AI when ALL of the following are true:
    //   a) Structural signal is UNLIKELY (non-numeric or wrong length, not 4-digit chemical candidate)
    //   b) SKU complexity is "suspect" (letters on both ends / long mixed alphanumeric)
    //   c) Name is mechanical (isMechanicalName returns true) OR name is clearly OEM descriptive
    //
    // OR skip AI when structural is UNLIKELY and name is mechanical — either signal alone
    // with the other being neutral is enough to skip.
    //
    // Parts that pass the pre-filter go to AI with full context as before.
    for (const part of afterFuzzy) {
      const raw = part.sku.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const isNissanOEM  = raw.startsWith("999MP");
      const isCR2032     = /^(CR)?2032$/i.test(part.sku.trim().replace(/\s/g, "")) &&
                           /(BATTERY|BATT|KEY|FOB)/i.test(part.partName || "");

      // Fast-skip criteria — clearly not MOC, no need for AI
      const structural   = part.structural || { score: 0, label: "UNLIKELY" };
      const isUnlikely   = structural.score === 0;
      const complexity   = skuComplexity(part.sku);
      const isSuspect    = complexity === "suspect";
      const isMech       = isMechanicalName(part.partName);
      const hasMidLet    = /\d[A-Z]+\d/i.test(part.sku.replace(/-/g, ""));

      // Skip if: confirmed OEM format
      const skipOEM      = isNissanOEM || isCR2032;
      // Skip if: mid-letter OEM segment format (e.g. 76620-T20-A01)
      const skipSegment  = hasMidLet;
      // Skip if: UNLIKELY structure + mechanical name (both negative)
      const skipUnlikely = isUnlikely && isMech;
      // Skip if: suspect SKU (letters both ends) + UNLIKELY structure
      const skipSuspect  = isSuspect && isUnlikely;
      // Skip if: Toyota dealer + Toyota catalog format (digits-dash-digits) + mechanical name
      // e.g. TO48068-02301 = Toyota OEM sub-assembly, not MOC — dash pattern is Toyota catalog structure
      const toyotaDash   = dealerBrand === "toyota" &&
                           /\d{4,}-\d{4,}/.test(part.sku) &&
                           isMech;

      const skip = skipOEM || skipSegment || skipUnlikely || skipSuspect || toyotaDash;

      if (skip) {
        preExcluded.push({
          ...part, matchType: "UNMATCHED",
          matchedArchetype: null, matchedPartNumber: null,
          confidence: null,
          reason: skipOEM
            ? (isNissanOEM ? "Nissan OEM 999MP-format part — confirmed OEM product line, not MOC"
                           : "CR2032 / 2032 coin cell battery with battery/key name — confirmed OEM key fob battery, not a MOC product")
            : skipSegment
            ? "OEM segment-format part number (letters between digit groups) — not MOC format"
            : toyotaDash
            ? "Toyota catalog format (####-####) with mechanical name — OEM sub-assembly, not MOC"
            : skipUnlikely
            ? "Non-MOC structure with mechanical part name — pre-filtered before AI"
            : "Suspect SKU format with non-MOC structure — pre-filtered before AI",
          incentive: null,
        });
      } else {
        toAIMatch.push(part);
      }
    }

    setProgress(20);

    const BATCH_SIZE  = 30;
    const aiResults   = [];
    // Build alias context from mergedAliases (hardcoded baseline + all approved dealer names)
    const knownAliases = Object.fromEntries(
      Object.entries(mergedAliases).map(([bare, names]) => [bare, names.slice(0, 8).join(" / ")])
    );
    const mappingsList = allMappings.map((m, idx) => {
      const aliases = knownAliases[m.barePartNumber];
      const aliasStr = aliases ? " | Dealers call it: " + aliases : "";
      return (idx + 1) + ". Bare Part#: " + m.barePartNumber + " | Full Name: " + m.manufacturerPart + aliasStr;
    }).join("\n");

    for (let i = 0; i < toAIMatch.length; i += BATCH_SIZE) {
      const batch = toAIMatch.slice(i, i + BATCH_SIZE);
      setProgress(20 + Math.round((i / Math.max(toAIMatch.length, 1)) * 75));

      const partsList = batch.map((p, idx) =>
        (idx + 1) + ". Raw SKU: " + p.sku + " | Prefix: " + (p.makeCode || "none") +
        " | Bare Part#: " + p.barePartNumber +
        " | Structure: " + p.structural.label + " (" + p.structural.detail + ")" +
        " | DMS Name: " + p.partName + " | DMS: " + p.dmsType
      ).join("\n");

      const prompt = "You are an automotive parts matching expert for MOC Products distributor.\n\n" +
        "Determine if each dealer DMS part matches a MOC product archetype.\n\n" +
        "IMPORTANT: These parts have already passed exact and fuzzy numeric matching. " +
        "The part number alone did NOT identify them. " +
        "Your primary signal is the DMS Name — dealers sometimes set up MOC products under completely custom internal part numbers that bear no resemblance to the MOC number. " +
        "A part named COOL PROT, THRTL CLN, MP BOOST, or ATF FLUSH is likely MOC even if the number looks odd.\n\n" +
        "DMS PREFIX CONTEXT:\n" +
        "- R&R DMS prepends a make code before the part number (TO=Toyota, SU=Subaru, TOMP=Toyota branded). TO01071 means bare number 01071.\n" +
        "- CDK DMS exports bare numbers with no prefix.\n" +
        "- The Bare Part# has already been stripped of the prefix for you.\n\n" +
        "STRUCTURAL SIGNAL (weighted prior, not a verdict):\n" +
        "- MOC numbers are almost always exactly 5 digits, often with a leading zero (01071, 06002).\n" +
        "- STRONG = 5 digits + leading zero. Raises MOC probability when name also fits.\n" +
        "- POSSIBLE = 5 digits, no leading zero. Still consistent.\n" +
        "- UNLIKELY = wrong length or non-numeric. Name must be very clearly MOC to match.\n\n" +
        "MOC PRODUCT ARCHETYPES:\n" + mappingsList + "\n\n" +
        "PARTS TO CLASSIFY:\n" + partsList + "\n\n" +
        "Respond ONLY with a JSON array. Each object:\n" +
        "- index: 1-based\n" +
        "- matched: true or false\n" +
        "- mocPartNumber: bare 5-digit string if matched, else null\n" +
        "- confidence: HIGH, MEDIUM, or LOW (only if matched)\n" +
        "- reason: one sentence explaining what signal led to the match\n\n" +
        "THINK IN TERMS OF EVIDENCE — signals stack for or against. No single signal is a verdict except an exact part number match.\n\n" +
        "EVIDENCE FOR a MOC match (stronger = higher confidence):\n" +
        "- Part number core matches a known MOC number (strongest signal)\n" +
        "- 5-digit numeric structure, especially with a leading zero\n" +
        "- Name describes a chemical product: fluid treatment, cleaner, conditioner, aerosol, service kit\n" +
        "- Name directly references a MOC product (E-Shield, Shyft, Arctic Blast, Optimizer, MP Boost, etc.)\n" +
        "- Fluid type in the name aligns with a MOC archetype (e.g. 75W-90 → Gear Guard, CVT fluid → CVT Conditioner)\n\n" +
        "EVIDENCE AGAINST a MOC match:\n" +
        "- DMS name does not resemble the MOC archetype name at all — this is a strong negative signal. " +
        "If the name says CONTROL UNIT, COMBINATION, BOLT, BRACKET, ASSY etc. and you are considering matching " +
        "it to E-SHIELD or COOLING SYSTEM FLUSH, the name mismatch alone should make you very skeptical\n" +
        "- Part number ends in a letter (e.g. 75W90P, A4100P) — OEM spec suffix\n" +
        "- Part number is too long or contains embedded letters mid-number\n" +
        "- Name describes a mechanical component: ASSY, ASSEMBLY, BLADE, SENSOR, FILTER, GASKET, SEAL, " +
        "BEARING, BRACKET, PANEL, COVER, CLIP, CONTROLLER, FINISHER, TRIM\n" +
        "- Name is a tire brand or size (YOKOHAMA, BRIDGESTONE, 245/40R, etc.)\n" +
        "- UNLIKELY structural signal (complex alphanumeric format)\n\n" +
        "WEIGHTING — part number is 70%, part name is 30%:\n" +
        "- The part number is the primary signal. If the number structure is close to a MOC archetype, " +
        "that is strong evidence. If the number bears no resemblance, name alone cannot make a match.\n" +
        "- The name is a supporting signal only. A matching name on a wrong number = UNMATCHED. " +
        "A close number with a slightly off name = MAYBE (LOW confidence). " +
        "A close number with a matching name = confident match (HIGH or MEDIUM).\n" +
        "- Important: there are OEM parts for every chemical category MOC sells. " +
        "A name like BRAKE FLUID or GEAR OIL is common across hundreds of OEM parts — " +
        "it is weak evidence on its own unless the number also points to MOC.\n" +
        "- A name that clearly describes a mechanical component (CONTROL UNIT, BOLT, ASSY, COMBINATION) " +
        "is a mild negative — it lowers confidence but does not veto a strong number match.\n" +
        "- When genuinely ambiguous, UNMATCHED is safer than a wrong guess.";

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4000,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data   = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        const text   = (data.content || []).map(c => c.text || "").join("");
        const clean  = text.replace(/```json|```/g, "").trim();
        let parsed;
        try {
          parsed = JSON.parse(clean);
        } catch (parseErr) {
          throw new Error("JSON parse failed. Response was: " + clean.slice(0, 200));
        }

        for (const item of parsed) {
          const part = batch[item.index - 1];
          if (!part) continue;

          // Robust archetype lookup — AI may return the number in various formats:
          // "04461", "4461", 4461 (integer), "04461 - SHYFT...", etc.
          // Strip everything non-digit, then try with and without leading zero padding.
          let mapping = null;
          if (item.matched && item.mocPartNumber != null) {
            const raw      = String(item.mocPartNumber).replace(/[^0-9]/g, "");
            const padded   = raw.padStart(5, "0");
            const unpadded = raw.replace(/^0+/, "") || "0";
            mapping = allMappings.find(m =>
              m.barePartNumber === padded ||
              m.barePartNumber === raw ||
              m.barePartNumber.replace(/^0+/, "") === unpadded
            );
          }

          aiResults.push({
            ...part,
            matchType:         item.matched ? "AI" : "UNMATCHED",
            matchedArchetype:  mapping ? mapping.manufacturerPart : null,
            matchedPartNumber: mapping ? mapping.barePartNumber : null,
            confidence:        item.confidence || null,
            reason:            item.reason || "No match found",
            incentive:         mapping ? mapping.incentive : null,
          });
        }
      } catch (err) {
        const errMsg = err && err.message ? err.message : String(err);
        for (const part of batch) {
          aiResults.push({
            ...part, matchType: "UNMATCHED",
            matchedArchetype: null, matchedPartNumber: null,
            confidence: null, reason: "API error: " + errMsg, incentive: null,
          });
        }
      }
      // Check cancel flag between batches — wipe and return to idle
      if (cancelRef.current) {
        setResults([]);
        setApprovalQueue(prev => prev.filter(r => r.approved === "deferred"));
        setStatus("idle");
        return;
      }
    }

    setProgress(100);

    // Sort: EXACT → AI → UNMATCHED by structural score desc
    const structScore = (r) => !r.structural ? 3 : r.structural.score === 2 ? 0 : r.structural.score === 1 ? 1 : 2;
    const matchOrder  = { EXACT: 0, FUZZY: 1, AI: 2, UNMATCHED: 3 };

    // Post-pass reclassification: UNMATCHED parts with 4-digit POSSIBLE structure
    // and a chemical-sounding name → MAYBE LOW.
    // These are candidates for missing archetypes, not confirmed OEM parts.
    const reclassified = [...exactMatched, ...fuzzyMatched, ...aiResults, ...preExcluded].map(r => {
      if (r.matchType !== "UNMATCHED") return r;
      const is4digit   = /^\d{4}$/.test(String(r.barePartNumber).trim());
      const isChemical = !isMechanicalName(r.partName) && (r.partName || "").trim().length > 0;
      if (is4digit && isChemical) {
        return {
          ...r,
          matchType:  "AI",
          confidence: "LOW",
          matchedArchetype:   null,
          matchedPartNumber:  null,
          reason: "4-digit number with chemical product name — possible MOC part with dropped leading zero, no archetype on file yet",
        };
      }
      return r;
    });

    const sorted = reclassified.sort((a, b) => {
      const md = matchOrder[a.matchType] - matchOrder[b.matchType];
      return md !== 0 ? md : structScore(a) - structScore(b);
    });
    setResults(sorted);

    // Auto-capture DMS names from canonical exact matches into alias pool
    // These are confirmed matches — no approval needed. Stored with origin "exact_auto"
    // so they can be individually removed if found to be wrong.
    let autoAliases = { ...aliasEntries };
    const canonicalBare = new Set(allMappings.map(m => m.barePartNumber));
    for (const r of exactMatched) {
      if (r.partName && r.matchedPartNumber && canonicalBare.has(r.barePartNumber)) {
        autoAliases = await addToAliases(r.matchedPartNumber, r.partName, r.sku, "exact_auto", autoAliases);
      }
    }
    setAliasEntries(autoAliases);

    // Log run stats — exact match % for launch readiness tracking
    const totalParts  = sorted.length;
    const exactCount  = sorted.filter(r => r.matchType === "EXACT").length;
    const exactPct    = totalParts > 0 ? parseFloat((exactCount / totalParts * 100).toFixed(1)) : 0;
    const runEntry    = {
      date:     new Date().toISOString(),
      dealer:   dealerName.trim() || "unknown",
      total:    totalParts,
      exact:    exactCount,
      exactPct,
    };
    const updatedHistory = [...runHistory, runEntry].slice(-50); // keep last 50 runs
    setRunHistory(updatedHistory);
    try { await window.storage.set("runHistory", JSON.stringify(updatedHistory)); } catch {}

    // Build approval queue — ALL fuzzy matches + AI + maybe go to queue for review
    // (EXACT canonical matches are auto-approved, everything else needs human eyes)
    const knownSkus = new Set(approvedMappings.map(a => a.dmsSku.toUpperCase()));
    const knownBare = new Set(allMappings.map(m => m.barePartNumber));
    const queue = sorted.filter(r => {
      if (!r.matchedArchetype) return false;                         // unmatched
      if (r._divergenceReason) return true;                          // NAME DIVERGENCE GUARD — always queue even if SKU was previously approved
      if (knownSkus.has(r.sku.toUpperCase())) return false;          // already approved
      if (r.matchType === "EXACT" && knownBare.has(r.barePartNumber)) return false; // canonical exact — auto
      return true;                                                   // FUZZY + AI all go to queue
    }).map(r => ({
      ...r,
      approved: null,
      // Surface divergence hint in reason so reviewer knows why this was flagged
      reason: r._divergenceReason ? r._divergenceReason : r.reason,
    }));
    // Merge new results with any existing deferred items so deferrals survive re-runs
    setApprovalQueue(prev => {
      const deferred = prev.filter(r => r.approved === "deferred");
      // Don't re-add items already deferred
      const deferredSkus = new Set(deferred.map(d => d.sku.toUpperCase()));
      const fresh = queue.filter(r => !deferredSkus.has(r.sku.toUpperCase()));
      return [...deferred, ...fresh];
    });
    setStatus("done");

    } catch (outerErr) {
      const msg = outerErr && outerErr.message ? outerErr.message : String(outerErr);
      setErrorMsg("Run failed: " + msg);
      setStatus("error");
    }
  };

  // ── ARCHETYPE HANDLERS ───────────────────────────────────────────────────────
  const handleAddArchetype = async () => {
    const bare = newPartNumber.trim().padStart(5, "0");
    const name = newPartName.trim().toUpperCase();
    if (!bare || !name) return;
    const fullName = bare + " - " + name;
    const entry = {
      barePartNumber:   bare,
      manufacturerPart: fullName,
      incentive:        parseFloat(newIncentive) || 0,
      addedAt:          new Date().toISOString(),
    };
    let updated;
    if (editingArchetypeIdx !== null) {
      // Overwrite the existing custom archetype
      updated = customArchetypes.map((a, i) => i === editingArchetypeIdx ? entry : a);
    } else {
      updated = [...customArchetypes, entry];
    }
    setCustomArchetypes(updated);
    try { await window.storage.set("customArchetypes", JSON.stringify(updated)); }
    catch (e) { console.error("Custom archetype save failed", e); }
    setNewPartNumber(""); setNewPartName(""); setNewIncentive("");
    setShowAddForm(false); setEditingArchetypeIdx(null);
  };

  const handleCorrect = async (idx) => {
    if (!correctArchetype) return;
    const matched = allMappings.find(m => m.barePartNumber === correctArchetype || m.manufacturerPart === correctArchetype);
    if (!matched) return;
    // Update the queue row with the corrected archetype — then approve it
    const item = { ...approvalQueue[idx], matchedPartNumber: matched.barePartNumber, matchedArchetype: matched.manufacturerPart, incentive: matched.incentive || 0 };
    const newEntry = {
      dmsSku:           item.sku,
      dmsPartName:      item.partName,
      barePartNumber:   matched.barePartNumber,
      manufacturerPart: matched.manufacturerPart,
      incentive:        matched.incentive || 0,
      approvedAt:       new Date().toISOString(),
      correctedFrom:    approvalQueue[idx].matchedPartNumber,
    };
    const updatedMappings = [...approvedMappings, newEntry];
    setApprovedMappings(updatedMappings);
    try { await window.storage.set("approvedMappings", JSON.stringify(updatedMappings)); }
    catch (e) { console.error("Storage save failed", e); }
    await logAccuracy(approvalQueue[idx], "corrected", accuracyLog);
    const updatedAliases = await addToAliases(matched.barePartNumber, item.partName, item.sku, "approved", aliasEntries);
    setAliasEntries(updatedAliases);
    // Remove from deferred if needed
    try {
      const s = await window.storage.get("deferredMappings");
      if (s && s.value) {
        const filtered = JSON.parse(s.value).filter(d => d.sku !== item.sku);
        await window.storage.set("deferredMappings", JSON.stringify(filtered));
      }
    } catch {}
    setApprovalQueue(q => q.map((r, i) => i === idx ? { ...r, approved: true, matchedArchetype: matched.manufacturerPart, matchedPartNumber: matched.barePartNumber } : r));
    setCorrectingIdx(null);
    setCorrectArchetype("");
  };

  // ── APPROVAL HANDLERS ────────────────────────────────────────────────────────
  // Helper: add a dmsPartName to dynamicAliases for a given barePartNumber and persist
  // addToAliases: adds a rich entry to aliasEntries and persists
  // Returns updated aliasEntries object
  const addToAliases = async (bare, name, sourceSku, origin, currentEntries) => {
    if (!name || !bare) return currentEntries;
    const updated   = { ...currentEntries };
    if (!updated[bare]) updated[bare] = [];
    const normName  = name.trim().toUpperCase().replace(/[™®©]/g, "").trim();
    // Deduplicate by name
    if (!updated[bare].find(e => e.name === normName)) {
      updated[bare] = [...updated[bare], {
        name:      normName,
        sourceSku: sourceSku || "",
        origin:    origin || "approved",
        addedAt:   new Date().toISOString(),
      }].sort((a, b) => a.name.localeCompare(b.name));
    }
    try {
      await window.storage.set("aliasEntries", JSON.stringify(updated));
    } catch (e) { console.error("Alias storage failed", e); }
    return updated;
  };

  // removeAlias: removes a specific alias entry by name from a bare part number
  const removeAlias = async (bare, name) => {
    const updated = { ...aliasEntries };
    if (updated[bare]) {
      updated[bare] = updated[bare].filter(e => e.name !== name);
      if (updated[bare].length === 0) delete updated[bare];
    }
    setAliasEntries(updated);
    try { await window.storage.set("aliasEntries", JSON.stringify(updated)); }
    catch (e) { console.error("Alias remove failed", e); }
  };

  const handleApprove = async (idx) => {
    const item = approvalQueue[idx];
    const newEntry = {
      dmsSku:           item.sku,
      dmsPartName:      item.partName,
      barePartNumber:   item.matchedPartNumber,
      manufacturerPart: item.matchedArchetype,
      incentive:        item.incentive || 0,
      approvedAt:       new Date().toISOString(),
    };
    // Save SKU mapping
    const updatedMappings = [...approvedMappings, newEntry];
    setApprovedMappings(updatedMappings);
    try { await window.storage.set("approvedMappings", JSON.stringify(updatedMappings)); }
    catch (e) { console.error("Storage save failed", e); }
    // Save DMS name into alias pool so future AI runs benefit from this dealer's language
    const updatedAliases = await addToAliases(item.matchedPartNumber, item.partName, item.sku, "approved", aliasEntries);
    setAliasEntries(updatedAliases);
    // Remove from deferred storage if it was deferred
    try {
      const s = await window.storage.get("deferredMappings");
      if (s && s.value) {
        const filtered = JSON.parse(s.value).filter(d => d.sku !== item.sku);
        await window.storage.set("deferredMappings", JSON.stringify(filtered));
      }
    } catch {}
    // Mark approved in queue
    await logAccuracy(item, "approved", accuracyLog);
    setApprovalQueue(q => q.map((r, i) => i === idx ? { ...r, approved: true } : r));
  };

  const handleReject = async (idx) => {
    const item    = approvalQueue[idx];
    logAccuracy(item, "rejected", accuracyLog);
    // Persist dealer-scoped NO if we have a dealer name
    const key = dealerName.trim().toLowerCase();
    if (key) {
      const existing = dealerRejections[key] || [];
      if (!existing.map(s => s.toUpperCase()).includes(item.sku.toUpperCase())) {
        const updated = { ...dealerRejections, [key]: [...existing, item.sku] };
        setDealerRejections(updated);
        try { await window.storage.set("dealerRejections", JSON.stringify(updated)); } catch {}
      }
    }
    setSessionRejected(prev => new Set([...prev, item.sku.toUpperCase()]));
    setApprovalQueue(q => q.map((r, i) => i === idx ? { ...r, approved: false } : r));
  };

  const handleRejectForeverPrompt = (idx) => {
    const item = approvalQueue[idx];
    setPinPrompt({ idx, sku: item.sku, partName: item.partName });
    setPinValue("");
    setPinError(false);
  };

  const handleRejectForeverConfirm = async () => {
    if (pinValue !== "2115") { setPinError(true); return; }

    if (pinPrompt.bulk) {
      // Bulk block
      const newEntries = pinPrompt.skus.map((sku, i) => ({
        sku: sku.toUpperCase(), partName: pinPrompt.partNames[i] || "", blockedAt: new Date().toISOString(),
      }));
      const updated = [
        ...blockedSkus.filter(b => !pinPrompt.skus.map(s => s.toUpperCase()).includes(b.sku.toUpperCase())),
        ...newEntries,
      ];
      setBlockedSkus(updated);
      try { await window.storage.set("blockedSkus", JSON.stringify(updated)); } catch {}
      for (const idx of pinPrompt.indices) {
        const item = approvalQueue[idx];
        if (item) logAccuracy(item, "rejected", accuracyLog);
      }
      setApprovalQueue(q => q.map((r, i) => pinPrompt.indices.includes(i) ? { ...r, approved: false } : r));
      setSessionRejected(prev => new Set([...prev, ...pinPrompt.skus.map(s => s.toUpperCase())]));
      setSelectedQueue(new Set());
    } else {
      // Single block
      const { idx, sku, partName } = pinPrompt;
      const item = approvalQueue[idx];
      const newEntry = { sku: sku.toUpperCase(), partName: partName || "", blockedAt: new Date().toISOString() };
      const updated  = [...blockedSkus.filter(b => b.sku.toUpperCase() !== sku.toUpperCase()), newEntry];
      setBlockedSkus(updated);
      try { await window.storage.set("blockedSkus", JSON.stringify(updated)); } catch {}
      logAccuracy(item, "rejected", accuracyLog);
      setApprovalQueue(q => q.map((r, i) => i === idx ? { ...r, approved: false } : r));
      setSessionRejected(prev => new Set([...prev, sku.toUpperCase()]));
    }

    setPinPrompt(null);
    setPinValue("");
  };

  const handleUnblockSku = async (sku) => {
    const updated = blockedSkus.filter(b => b.sku.toUpperCase() !== sku.toUpperCase());
    setBlockedSkus(updated);
    try { await window.storage.set("blockedSkus", JSON.stringify(updated)); } catch {}
  };

  const handleDefer = async (idx) => {
    // Mark as deferred in the queue UI
    setApprovalQueue(q => q.map((r, i) => i === idx ? { ...r, approved: "deferred" } : r));
    // Persist deferred item to storage so it survives page refresh
    const item = approvalQueue[idx];
    await logAccuracy(item, "deferred", accuracyLog);
    const current = approvalQueue.filter(r => r.approved === "deferred" || (approvalQueue.indexOf(r) === idx));
    // Re-read current deferred list and add this item
    let stored = [];
    try {
      const s = await window.storage.get("deferredMappings");
      if (s && s.value) stored = JSON.parse(s.value);
    } catch {}
    // Avoid duplicates
    if (!stored.find(d => d.sku === item.sku)) {
      stored.push(item);
    }
    try {
      await window.storage.set("deferredMappings", JSON.stringify(stored));
    } catch (e) { console.error("Defer storage failed", e); }
  };

  const handleBulkApprove = async () => {
    for (const idx of Array.from(selectedQueue).sort((a,b) => b - a)) {
      await handleApprove(idx);
    }
    setSelectedQueue(new Set());
  };

  const handleBulkNo = async () => {
    for (const idx of Array.from(selectedQueue).sort((a,b) => b - a)) {
      await handleReject(idx);
    }
    setSelectedQueue(new Set());
    // sessionRejected is updated inside handleReject per item
  };

  const handleBulkBlockPrompt = () => {
    // Use a special multi-block prompt — reuse pinPrompt with idx = array
    const items = Array.from(selectedQueue).map(idx => approvalQueue[idx]);
    setPinPrompt({ bulk: true, indices: Array.from(selectedQueue), skus: items.map(i => i.sku), partNames: items.map(i => i.partName) });
    setPinValue("");
    setPinError(false);
  };

  const handleApproveAll = async () => {
    const pending = approvalQueue.filter(r => r.approved === null);
    const newEntries = pending.map(item => ({
      dmsSku:           item.sku,
      dmsPartName:      item.partName,
      barePartNumber:   item.matchedPartNumber,
      manufacturerPart: item.matchedArchetype,
      incentive:        item.incentive || 0,
      approvedAt:       new Date().toISOString(),
    }));
    // Save all SKU mappings
    const updatedMappings = [...approvedMappings, ...newEntries];
    setApprovedMappings(updatedMappings);
    try { await window.storage.set("approvedMappings", JSON.stringify(updatedMappings)); }
    catch (e) { console.error("Storage save failed", e); }
    // Batch-add all DMS names into alias pool
    let updatedAliases = { ...aliasEntries };
    for (const item of pending) {
      if (item.partName && item.matchedPartNumber) {
        updatedAliases = await addToAliases(item.matchedPartNumber, item.partName, item.sku, "approved", updatedAliases);
      }
    }
    setAliasEntries(updatedAliases);
    setApprovalQueue(q => q.map(r => r.approved === null ? { ...r, approved: true } : r));
  };

  // A result is MATCHED if the process made a confident call (any match type, HIGH or MEDIUM confidence)
  // MAYBE = AI matched but LOW confidence — needs human eyes
  // UNMATCHED = no match found
  function isMatched(r) {
    return r.matchType === "EXACT" || r.matchType === "FUZZY" ||
      (r.matchType === "AI" && (r.confidence === "HIGH" || r.confidence === "MEDIUM"));
  }
  function isMaybe(r) {
    return r.matchType === "AI" && r.confidence === "LOW";
  }

  // ── EXPORT ───────────────────────────────────────────────────────────────────
  // Matched  = EXACT, FUZZY, or AI with HIGH/MEDIUM confidence
  // Maybe    = AI with LOW confidence (needs human review)
  const exportResults = () => {
    const matched = results.filter(isMatched);
    const maybes  = results.filter(isMaybe);

    const toRows = (list) => list.map(r => ({
      "Raw SKU":        r.sku,
      "DMS Type":       r.dmsType,
      "Prefix":         r.makeCode || "",
      "DMS Part Name":  r.partName,
      "MOC Archetype":  r.matchedArchetype || "",
      "MOC Part #":     r.matchedPartNumber || "",
      "Match Type":     r.matchType,
      "Confidence":     r.confidence || "",
      "Reason":         r.reason,
      "Incentive $":    r.incentive != null ? r.incentive : "",
    }));

    const wb  = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(toRows(matched));
    const ws2 = XLSX.utils.json_to_sheet(toRows(maybes));
    XLSX.utils.book_append_sheet(wb, ws1, "Matched");
    XLSX.utils.book_append_sheet(wb, ws2, "Maybe - Review");
    XLSX.writeFile(wb, "MOC_Match_Results.xlsx");
  };

  const filteredResults = results.filter(r =>
    filter === "matched"   ? isMatched(r)              :
    filter === "maybe"     ? isMaybe(r)                :
    filter === "unmatched" ? r.matchType === "UNMATCHED" : true
  );

  const counts = {
    total:     results.length,
    matched:   results.filter(isMatched).length,
    maybe:     results.filter(isMaybe).length,
    possible:  results.filter(r => r.matchType === "UNMATCHED" && r.structural && r.structural.label === "POSSIBLE").length,
    unmatched: results.filter(r => r.matchType === "UNMATCHED").length,
    exact:     results.filter(r => r.matchType === "EXACT").length,
  };
  const matchRate  = counts.total > 0 ? Math.round((counts.matched / counts.total) * 100) : 0;
  const exactRate  = counts.total > 0 ? (counts.exact / counts.total * 100).toFixed(1) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", fontFamily: "'DM Mono','Courier New',monospace", color: "#e2e8f0", padding: 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #1a1a1f; }
        ::-webkit-scrollbar-thumb { background: #e65c00; border-radius: 3px; }
        .upload-zone { transition: all 0.2s; }
        .upload-zone:hover { border-color: #e65c00 !important; background: #1a1008 !important; }
        .stat-card { transition: all 0.15s; }
        .stat-card:hover { transform: translateY(-2px); }
        .filter-btn { transition: all 0.15s; cursor: pointer; }
        .filter-btn:hover { opacity: 0.85; }
        .result-row:hover { background: #1a1a22 !important; }
        .run-btn { transition: all 0.2s; }
        .run-btn:hover:not(:disabled) { background: #ff7a1a !important; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(230,92,0,0.4); }
        .run-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      `}</style>

      <div style={{ background: "#111114", borderBottom: "2px solid #e65c00", padding: "20px 32px", display: "flex", alignItems: "center", gap: "20px" }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "28px", letterSpacing: "3px", color: "#e65c00" }}>MOC PART MATCHER</div>
          <div style={{ fontSize: "11px", color: "#64748b", letterSpacing: "2px", marginTop: "2px" }}>AI-POWERED DMS TO MOC ARCHETYPE IDENTIFICATION</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "10px", color: "#475569", textAlign: "right", lineHeight: "1.6" }}>
          {MOC_MAPPINGS.length} CORE · {approvedMappings.length} DEALER SKUs · {Object.values(mergedAliases).reduce((s,a)=>s+a.length,0)} ALIASES<br />
          <span style={{ color: "#e65c00" }}>EZ WINS</span> INTERNAL TOOL
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: "1400px", margin: "0 auto" }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "20px", alignItems: "stretch", marginBottom: "28px" }}>
          <div
            className="upload-zone"
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => document.getElementById("file-input").click()}
            style={{
              border: "2px dashed " + (dragOver ? "#e65c00" : partsFile ? "#22c55e" : "#2d2d38"),
              borderRadius: "8px", padding: "28px",
              background: dragOver ? "#1a1008" : partsFile ? "#0a1a0e" : "#111114",
              cursor: "pointer", textAlign: "center",
            }}
          >
            <input id="file-input" type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileInput} />
            {partsFile ? (
              <div>
                <div style={{ fontSize: "20px", marginBottom: "6px" }}>✓</div>
                <div style={{ color: "#22c55e", fontSize: "13px", fontWeight: "500" }}>{partsFile}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "6px" }}>
                  <span style={{
                    padding: "2px 10px", borderRadius: "4px", fontSize: "11px", letterSpacing: "1px",
                    background: fileDms === "R&R" ? "#1a0f2e" : "#0a1e1a",
                    color:      fileDms === "R&R" ? "#c084fc" : "#34d399",
                    border:     "1px solid " + (fileDms === "R&R" ? "#6b21a8" : "#065f46"),
                  }}>{fileDms} DETECTED</span>
                  <span style={{ color: "#64748b", fontSize: "11px" }}>{parsedParts.length} unique parts</span>
                  {dealerBrand === "toyota" && (
                    <span style={{ padding: "2px 10px", borderRadius: "4px", fontSize: "11px", letterSpacing: "1px",
                      background: "#1a0a00", color: "#fb923c", border: "1px solid #c2410c" }}>TOYOTA</span>
                  )}
                  {status !== "matching" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClearFile(); }}
                      style={{
                        padding: "1px 8px", background: "#1a0505", color: "#f87171",
                        border: "1px solid #dc2626", borderRadius: "3px",
                        fontSize: "10px", fontFamily: "'DM Mono'", cursor: "pointer", letterSpacing: "1px",
                      }}>✕ CLEAR</button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.4 }}>⬆</div>
                <div style={{ color: "#94a3b8", fontSize: "13px" }}>Drop your DMS parts Excel file here</div>
                <div style={{ color: "#475569", fontSize: "11px", marginTop: "4px" }}>or click to browse — .xlsx / .xls</div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "stretch" }}>
            {status === "matching" ? (
              <button
                onClick={handleCancelRun}
                style={{
                  background: "#1a0505", color: "#f87171", border: "2px solid #dc2626", borderRadius: "8px",
                  padding: "0 32px", flex: 1,
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "2px",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <div>CANCEL</div>
                  <div style={{ fontFamily: "'DM Mono'", fontSize: "11px", color: "#94a3b8" }}>{progress}%</div>
                </div>
              </button>
            ) : (
              <button
                className="run-btn"
                onClick={runMatching}
                disabled={!parsedParts.length}
                style={{
                  background: parsedParts.length ? "#e65c00" : "#2d2d38",
                  color: "#fff", border: "none", borderRadius: "8px",
                  padding: "0 32px", flex: 1,
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "2px",
                  cursor: parsedParts.length ? "pointer" : "not-allowed", whiteSpace: "nowrap",
                }}
              >RUN MATCHING</button>
            )}
            <div style={{ display: "flex", gap: "6px" }}>
              {[{ val: "all", label: "OTHER" }, { val: "toyota", label: "TOYOTA" }].map(opt => (
                <button key={opt.val} onClick={() => setDealerBrand(opt.val)}
                  disabled={status === "matching"}
                  style={{
                    flex: 1, padding: "5px 0", borderRadius: "4px", fontSize: "10px",
                    letterSpacing: "1px", fontFamily: "'DM Mono'",
                    cursor: status === "matching" ? "not-allowed" : "pointer",
                    background: dealerBrand === opt.val ? (opt.val === "toyota" ? "#1a0a00" : "#0a1a0e") : "#0d0d0f",
                    color:      dealerBrand === opt.val ? (opt.val === "toyota" ? "#fb923c" : "#22c55e") : "#475569",
                    border:     "1px solid " + (dealerBrand === opt.val ? (opt.val === "toyota" ? "#c2410c" : "#166534") : "#1e1e28"),
                  }}>{opt.label}</button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "1.5px", marginBottom: "4px" }}>DEALER</div>
              <input
                value={dealerName}
                onChange={e => { setDealerName(e.target.value); setDealerNameManual(true); }}
                disabled={status === "matching"}
                placeholder="auto-detected from filename"
                style={{
                  width: "100%", padding: "5px 8px", background: "#0d0d0f",
                  color: dealerName ? "#e2e8f0" : "#475569",
                  border: "1px solid " + (dealerName ? "#1e3a5f" : "#1e1e28"),
                  borderRadius: "4px", fontSize: "10px", fontFamily: "'DM Mono'",
                  boxSizing: "border-box",
                }} />
            </div>
          </div>
        </div>

        {status === "matching" && (
          <div style={{ height: "3px", background: "#1a1a1f", borderRadius: "2px", marginBottom: "24px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress + "%", background: "linear-gradient(90deg,#e65c00,#ff9a56)", borderRadius: "2px", transition: "width 0.3s" }} />
          </div>
        )}

        {status === "error" && (
          <div style={{ background: "#1a0505", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "16px", marginBottom: "24px", color: "#f87171", fontSize: "13px" }}>
            {errorMsg}
          </div>
        )}

        {status === "done" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: "12px", marginBottom: "24px" }}>
            {[
              { label: "TOTAL PARTS", value: counts.total,    color: "#94a3b8" },
              { label: "MATCH RATE",  value: matchRate + "%", color: "#e65c00" },
              { label: "MATCHED",     value: counts.matched,  color: "#22c55e" },
              { label: "EXACT %",     value: exactRate !== null ? exactRate + "%" : "—", color: "#60a5fa" },
              { label: "MAYBE",       value: counts.maybe,    color: "#f59e0b" },
              { label: "POSSIBLE",    value: counts.possible, color: "#a78bfa" },
              { label: "UNMATCHED",   value: counts.unmatched,color: "#64748b" },
            ].map(stat => (
              <div key={stat.label} className="stat-card" style={{ background: "#111114", border: "1px solid #1e1e28", borderRadius: "8px", padding: "14px", textAlign: "center" }}>
                <div style={{ fontSize: "26px", fontWeight: "500", color: stat.color, fontFamily: "'Bebas Neue'" }}>{stat.value}</div>
                <div style={{ fontSize: "10px", color: "#475569", letterSpacing: "1.5px", marginTop: "4px" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {status === "done" && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
            {[
              { id: "all",       label: "ALL (" + counts.total + ")"           },
              { id: "matched",   label: "MATCHED (" + counts.matched + ")"     },
              { id: "maybe",     label: "MAYBE (" + counts.maybe + ")"         },
              { id: "unmatched", label: "UNMATCHED (" + counts.unmatched + ")" },
            ].map(tab => (
              <button key={tab.id} className="filter-btn" onClick={() => setFilter(tab.id)} style={{
                padding: "7px 16px",
                background: filter === tab.id ? "#e65c00" : "#111114",
                color:      filter === tab.id ? "#fff"    : "#64748b",
                border:     "1px solid " + (filter === tab.id ? "#e65c00" : "#1e1e28"),
                borderRadius: "6px", fontSize: "11px", letterSpacing: "1px", fontFamily: "'DM Mono'",
              }}>{tab.label}</button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
              <button onClick={exportResults} style={{
                padding: "7px 20px", background: "#0a2e1a", color: "#22c55e",
                border: "1px solid #16a34a", borderRadius: "6px",
                fontSize: "11px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
              }}>⬇ EXPORT RESULTS</button>
              <button onClick={async () => {
                try {
                  const s = await window.storage.get("approvedMappings");
                  const data = s && s.value ? s.value : "[]";
                  const blob = new Blob([data], { type: "application/json" });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement("a");
                  a.href     = url;
                  a.download = "approved_mappings.json";
                  a.click();
                  URL.revokeObjectURL(url);
                } catch(e) { alert("Export failed: " + e.message); }
              }} style={{
                padding: "7px 20px", background: "#0a1a2e", color: "#60a5fa",
                border: "1px solid #1e3a5f", borderRadius: "6px",
                fontSize: "11px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
              }}>⬇ EXPORT MAPPINGS</button>
            </div>
          </div>
        )}

        {status === "done" && filteredResults.length > 0 && (
          <div style={{ background: "#111114", border: "1px solid #1e1e28", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#0d0d0f", borderBottom: "1px solid #1e1e28" }}>
                  {["SKU","DMS","PREFIX","STRUCT.","DMS PART NAME","MOC ARCHETYPE","TYPE","CONFIDENCE","REASON","ACTION"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontSize: "10px", letterSpacing: "1.5px", fontWeight: "500" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((r, i) => {
                  const conf     = r.confidence || (r.matchType === "EXACT" ? "EXACT" : null);
                  const colStyle = conf ? CONFIDENCE_COLORS[conf] : null;
                  const isNOd    = sessionRejected.has(r.sku.toUpperCase());
                  return (
                    <tr key={i} className="result-row" style={{ borderBottom: "1px solid #16161e", opacity: isNOd ? 0.4 : 1, background: isNOd ? (i % 2 === 0 ? "#1a0808" : "#160606") : isMatched(r) ? (i % 2 === 0 ? "#0d1a0d" : "#0b180b") : isMaybe(r) ? (i % 2 === 0 ? "#1a1505" : "#181303") : (i % 2 === 0 ? "#111114" : "#0f0f12") }}>
                      <td style={{ padding: "10px 16px", color: "#94a3b8", fontFamily: "'DM Mono'" }}>{r.sku}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{
                          padding: "2px 7px", borderRadius: "4px", fontSize: "10px", letterSpacing: "1px",
                          background: r.dmsType === "R&R" ? "#1a0f2e" : "#0a1e1a",
                          color:      r.dmsType === "R&R" ? "#c084fc" : "#34d399",
                          border:     "1px solid " + (r.dmsType === "R&R" ? "#6b21a8" : "#065f46"),
                        }}>{r.dmsType || "—"}</span>
                      </td>
                      <td style={{ padding: "10px 16px", color: r.makeCode ? "#f59e0b" : "#334155", fontSize: "11px", fontFamily: "'DM Mono'" }}>{r.makeCode || "—"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        {/* Structural signal is only meaningful for unmatched parts.
                            On confirmed matches it describes raw format, not match quality — hide it. */}
                        {r.matchType === "UNMATCHED" && r.structural ? (
                          <span title={r.structural.detail} style={{
                            padding: "2px 7px", borderRadius: "4px", fontSize: "10px", cursor: "help",
                            background: r.structural.score === 2 ? "#0a2a10" : r.structural.score === 1 ? "#1a1a08" : "#1a0808",
                            color:      r.structural.score === 2 ? "#4ade80" : r.structural.score === 1 ? "#facc15" : "#6b7280",
                            border:     "1px solid " + (r.structural.score === 2 ? "#166534" : r.structural.score === 1 ? "#713f12" : "#374151"),
                          }}>{r.structural.label}</span>
                        ) : r.matchType === "UNMATCHED"
                          ? <span style={{ color: "#334155" }}>—</span>
                          : <span style={{ color: "#334155", fontSize: "10px" }}>n/a</span>}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#cbd5e1" }}>{r.partName || <span style={{ color: "#334155" }}>—</span>}</td>
                      <td style={{ padding: "10px 16px", color: r.matchedArchetype ? "#e2e8f0" : "#334155" }}>{r.matchedArchetype || "—"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        {(() => {
                          const matched = isMatched(r);
                          const maybe   = isMaybe(r);
                          const label   = r.matchType === "EXACT" ? "EXACT" :
                                          r.matchType === "FUZZY" ? "FUZZY" :
                                          maybe ? "MAYBE" :
                                          matched ? "AI MATCH" : "UNMATCHED";
                          const bg      = r.matchType === "EXACT" ? "#0a1a2e" :
                                          r.matchType === "FUZZY" ? "#0a2a1a" :
                                          maybe ? "#2a1e05" :
                                          matched ? "#1a0a2e" : "#1a1a1a";
                          const clr     = r.matchType === "EXACT" ? "#60a5fa" :
                                          r.matchType === "FUZZY" ? "#34d399" :
                                          maybe ? "#f59e0b" :
                                          matched ? "#a78bfa" : "#475569";
                          const bdr     = r.matchType === "EXACT" ? "#1e3a5f" :
                                          r.matchType === "FUZZY" ? "#065f46" :
                                          maybe ? "#d97706" :
                                          matched ? "#3b1d6e" : "#2a2a2a";
                          return <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "10px", letterSpacing: "1px", background: bg, color: clr, border: "1px solid " + bdr }}>{label}</span>;
                        })()}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        {colStyle
                          ? <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "10px", letterSpacing: "1px", background: colStyle.bg, color: colStyle.text, border: "1px solid " + colStyle.border }}>{conf}</span>
                          : <span style={{ color: "#334155" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: "11px", maxWidth: "280px" }}>{r.reason}</td>
                      <td style={{ padding: "10px 16px", minWidth: "120px" }}>
                        {(r.matchType === "UNMATCHED" || (isMaybe(r) && r.confidence === "LOW")) && (
                          rowForm && rowForm.idx === i ? (
                            <div style={{ background: "#0a1a2e", border: "1px solid #1e3a5f", borderRadius: "6px", padding: "10px", minWidth: "260px" }}>
                              <div style={{ fontSize: "10px", color: "#60a5fa", letterSpacing: "1px", marginBottom: "8px" }}>NEW ARCHETYPE</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                <div>
                                  <div style={{ fontSize: "9px", color: "#475569", marginBottom: "2px" }}>PART NUMBER</div>
                                  <input value={rowForm.partNumber}
                                    onChange={e => setRowForm(f => ({ ...f, partNumber: e.target.value }))}
                                    style={{ width: "100%", padding: "5px 8px", background: "#0d0d0f", color: "#e2e8f0",
                                      border: "1px solid #1e3a5f", borderRadius: "3px", fontSize: "11px",
                                      fontFamily: "'DM Mono'", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                  <div style={{ fontSize: "9px", color: "#475569", marginBottom: "2px" }}>PRODUCT NAME</div>
                                  <input value={rowForm.partName}
                                    onChange={e => setRowForm(f => ({ ...f, partName: e.target.value }))}
                                    style={{ width: "100%", padding: "5px 8px", background: "#0d0d0f", color: "#e2e8f0",
                                      border: "1px solid #1e3a5f", borderRadius: "3px", fontSize: "11px",
                                      fontFamily: "'DM Mono'", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                  <div style={{ fontSize: "9px", color: "#475569", marginBottom: "2px" }}>INCENTIVE ($)</div>
                                  <input value={rowForm.incentive}
                                    onChange={e => setRowForm(f => ({ ...f, incentive: e.target.value }))}
                                    placeholder="0"
                                    style={{ width: "100%", padding: "5px 8px", background: "#0d0d0f", color: "#e2e8f0",
                                      border: "1px solid #1e3a5f", borderRadius: "3px", fontSize: "11px",
                                      fontFamily: "'DM Mono'", boxSizing: "border-box" }} />
                                </div>
                                <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                                  <button onClick={handleRowAddArchetype} style={{
                                    padding: "4px 12px", background: "#0a2a1a", color: "#22c55e",
                                    border: "1px solid #16a34a", borderRadius: "3px",
                                    fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                                  }}>✓ SAVE</button>
                                  <button onClick={() => setRowForm(null)} style={{
                                    padding: "4px 10px", background: "#1a1a1a", color: "#475569",
                                    border: "1px solid #2a2a2a", borderRadius: "3px",
                                    fontSize: "10px", fontFamily: "'DM Mono'", cursor: "pointer",
                                  }}>CANCEL</button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setRowForm({
                              idx: i,
                              partNumber: r.barePartNumber || r.sku,
                              partName: r.partName || "",
                              incentive: "",
                            })} style={{
                              padding: "4px 10px", background: "#0a1a2e", color: "#60a5fa",
                              border: "1px solid #1e3a5f", borderRadius: "4px",
                              fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}>+ ADD ARCHETYPE</button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── APPROVAL QUEUE ─────────────────────────────────────────────────── */}
        {(status === "done" || approvalQueue.filter(r => r.approved === "deferred").length > 0) && approvalQueue.filter(r => r.approved === null || r.approved === "deferred").length > 0 && (
          <div style={{ marginTop: "32px", background: "#111114", border: "1px solid #d97706", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ background: "#1a1505", borderBottom: "1px solid #d97706", padding: "14px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: "16px", letterSpacing: "2px", color: "#f59e0b" }}>
                  NEW MAPPINGS — PENDING APPROVAL
                </div>
                <div style={{ fontSize: "11px", color: "#78716c", marginTop: "2px" }}>
                  {approvalQueue.filter(r => r.approved === null).length} pending · {approvalQueue.filter(r => r.approved === "deferred").length} deferred — Approve to add to knowledge base, Defer to decide later.
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
                {selectedQueue.size > 0 && (
                  <>
                    <span style={{ fontSize: "10px", color: "#f59e0b", letterSpacing: "1px" }}>{selectedQueue.size} SELECTED</span>
                    <button onClick={handleBulkApprove} style={{
                      padding: "6px 14px", background: "#14532d", color: "#22c55e",
                      border: "1px solid #16a34a", borderRadius: "6px", fontSize: "10px",
                      letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                    }}>✓ APPROVE</button>
                    <button onClick={handleBulkNo} style={{
                      padding: "6px 14px", background: "#1a0505", color: "#f87171",
                      border: "1px solid #dc2626", borderRadius: "6px", fontSize: "10px",
                      letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                    }}>✗ NO</button>
                    <button onClick={handleBulkBlockPrompt} style={{
                      padding: "6px 14px", background: "#2a0505", color: "#ef4444",
                      border: "1px solid #991b1b", borderRadius: "6px", fontSize: "10px",
                      letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                    }}>⛔ BLOCK</button>
                  </>
                )}
                <button onClick={handleApproveAll} style={{
                  padding: "7px 18px", background: "#14532d", color: "#22c55e",
                  border: "1px solid #16a34a", borderRadius: "6px", fontSize: "11px",
                  letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer", whiteSpace: "nowrap",
                }}>✓ APPROVE ALL</button>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#0d0d0f", borderBottom: "1px solid #1e1e28" }}>
                  <th style={{ padding: "10px 12px", width: "36px" }}>
                    <input type="checkbox"
                      onChange={e => {
                        const pending = approvalQueue.map((r,i) => (r.approved === null || r.approved === "deferred") ? i : -1).filter(i => i >= 0);
                        setSelectedQueue(e.target.checked ? new Set(pending) : new Set());
                      }}
                      checked={selectedQueue.size > 0 && selectedQueue.size === approvalQueue.filter(r => r.approved === null || r.approved === "deferred").length}
                      style={{ cursor: "pointer", accentColor: "#f59e0b" }} />
                  </th>
                  {["DEALER SKU","DMS PART NAME","→ MOC ARCHETYPE","MATCH TYPE","CONFIDENCE","REASON","ACTION"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#475569", fontSize: "10px", letterSpacing: "1.5px", fontWeight: "500" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {approvalQueue.map((r, idx) => {
                  if (r.approved === true || r.approved === false) return null;
                  const isDeferred = r.approved === "deferred";
                  const isSelected = selectedQueue.has(idx);
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid #16161e", background: isSelected ? "#1a1a08" : isDeferred ? (idx % 2 === 0 ? "#1a1a05" : "#161603") : (idx % 2 === 0 ? "#111114" : "#0f0f12") }}>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <input type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            const next = new Set(selectedQueue);
                            e.target.checked ? next.add(idx) : next.delete(idx);
                            setSelectedQueue(next);
                          }}
                          style={{ cursor: "pointer", accentColor: "#f59e0b" }} />
                      </td>
                      <td style={{ padding: "10px 16px", color: "#94a3b8", fontFamily: "'DM Mono'", fontSize: "11px" }}>{r.sku}</td>
                      <td style={{ padding: "10px 16px", color: "#cbd5e1" }}>{r.partName || "—"}</td>
                      <td style={{ padding: "10px 16px", color: "#e2e8f0", fontWeight: "500" }}>{r.matchedArchetype}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: "4px", fontSize: "10px",
                          background: r.matchType === "FUZZY" ? "#0a2a1a" : "#1a0a2e",
                          color:      r.matchType === "FUZZY" ? "#34d399" : "#a78bfa",
                          border:     "1px solid " + (r.matchType === "FUZZY" ? "#065f46" : "#3b1d6e"),
                        }}>{r.matchType}</span>
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: "4px", fontSize: "10px",
                          background: r.confidence === "HIGH" ? "#0a2e1a" : r.confidence === "MEDIUM" ? "#2a1e05" : "#2a0a0a",
                          color:      r.confidence === "HIGH" ? "#22c55e" : r.confidence === "MEDIUM" ? "#f59e0b" : "#f87171",
                          border:     "1px solid " + (r.confidence === "HIGH" ? "#16a34a" : r.confidence === "MEDIUM" ? "#d97706" : "#dc2626"),
                        }}>{r.confidence || "—"}</span>
                      </td>
                      <td style={{ padding: "10px 16px", color: "#64748b", fontSize: "11px", maxWidth: "240px" }}>{r.reason}</td>
                      <td style={{ padding: "10px 16px" }}>
                        {isDeferred ? (
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <span style={{ padding: "3px 10px", borderRadius: "4px", fontSize: "10px",
                              background: "#1a1a05", color: "#facc15", border: "1px solid #a16207",
                              letterSpacing: "1px", fontFamily: "'DM Mono'" }}>⏸ DEFERRED</span>
                            <button onClick={() => handleApprove(idx)} style={{
                              padding: "4px 10px", background: "#14532d", color: "#22c55e",
                              border: "1px solid #16a34a", borderRadius: "4px",
                              fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                            }}>✓</button>
                            <button onClick={() => handleReject(idx)} style={{
                              padding: "4px 10px", background: "#1a0505", color: "#f87171",
                              border: "1px solid #dc2626", borderRadius: "4px",
                              fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                            }}>✗</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button onClick={() => handleApprove(idx)} style={{
                              padding: "4px 12px", background: "#14532d", color: "#22c55e",
                              border: "1px solid #16a34a", borderRadius: "4px",
                              fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                            }}>✓ APPROVE</button>
                            <button onClick={() => handleDefer(idx)} style={{
                              padding: "4px 12px", background: "#1a1a05", color: "#facc15",
                              border: "1px solid #a16207", borderRadius: "4px",
                              fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                            }}>⏸ DEFER</button>
                            <button onClick={() => { setCorrectingIdx(idx); setCorrectArchetype(""); }} style={{
                              padding: "4px 12px", background: "#0a1a2e", color: "#60a5fa",
                              border: "1px solid #1e3a5f", borderRadius: "4px",
                              fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                            }}>✎ CORRECT</button>
                            <button onClick={() => handleReject(idx)} style={{
                              padding: "4px 12px", background: "#1a0505", color: "#f87171",
                              border: "1px solid #dc2626", borderRadius: "4px",
                              fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                            }}>✗ NO</button>
                            <button onClick={() => handleRejectForeverPrompt(idx)} style={{
                              padding: "4px 12px", background: "#2a0505", color: "#ef4444",
                              border: "1px solid #991b1b", borderRadius: "4px",
                              fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                            }}>⛔ BLOCK</button>
                          </div>
                        )}
                        {correctingIdx === idx && (
                          <div style={{ marginTop: "8px", padding: "10px", background: "#0a1a2e", border: "1px solid #1e3a5f", borderRadius: "6px" }}>
                            <div style={{ fontSize: "10px", color: "#60a5fa", marginBottom: "6px", letterSpacing: "1px" }}>SELECT CORRECT ARCHETYPE</div>
                            <select
                              value={correctArchetype}
                              onChange={e => setCorrectArchetype(e.target.value)}
                              style={{ width: "100%", padding: "6px 8px", background: "#0d0d0f", color: "#e2e8f0",
                                border: "1px solid #1e3a5f", borderRadius: "4px", fontSize: "11px",
                                fontFamily: "'DM Mono'", marginBottom: "8px" }}>
                              <option value="">— select archetype —</option>
                              {allMappings.sort((a,b) => a.barePartNumber.localeCompare(b.barePartNumber)).map(m => (
                                <option key={m.barePartNumber} value={m.barePartNumber}>
                                  {m.manufacturerPart}{m.addedAt ? " ★" : ""}
                                </option>
                              ))}
                            </select>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button onClick={() => handleCorrect(idx)} style={{
                                padding: "4px 14px", background: "#0a2a1a", color: "#22c55e",
                                border: "1px solid #16a34a", borderRadius: "4px",
                                fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                              }}>✓ SAVE CORRECTION</button>
                              <button onClick={() => { setCorrectingIdx(null); setCorrectArchetype(""); }} style={{
                                padding: "4px 14px", background: "#1a1a1a", color: "#475569",
                                border: "1px solid #2a2a2a", borderRadius: "4px",
                                fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                              }}>CANCEL</button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {status === "idle" && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#2d2d38" }}>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: "48px", letterSpacing: "4px" }}>READY</div>
            <div style={{ fontSize: "12px", marginTop: "8px", letterSpacing: "2px" }}>UPLOAD A DMS PARTS FILE TO BEGIN</div>
          </div>
        )}

        <details style={{ marginTop: "32px" }}>
          <summary style={{ cursor: "pointer", fontSize: "11px", color: "#475569", letterSpacing: "1.5px", padding: "8px 0", display: "flex", alignItems: "center", gap: "12px" }}>
            <span>VIEW MOC ARCHETYPES ({MOC_MAPPINGS.length} core{customArchetypes.length > 0 ? " + " + customArchetypes.length + " custom" : ""}) {approvedMappings.length > 0 && "+ " + approvedMappings.length + " dealer mappings"} · {Object.values(aliasEntries).reduce((s, a) => s + a.length, 0)} aliases captured</span>
            <button onClick={async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (mappingsExportData) { setMappingsExportData(null); return; }
                try {
                  const s = await window.storage.get("approvedMappings");
                  setMappingsExportData(s && s.value ? s.value : "[]");
                } catch(err) { setMappingsExportData("error: " + err.message); }
              }} style={{
                padding: "3px 12px", background: mappingsExportData ? "#1a0a2e" : "#0a1a2e", color: "#60a5fa",
                border: "1px solid #1e3a5f", borderRadius: "4px",
                fontSize: "10px", letterSpacing: "1px", fontFamily: "'DM Mono'",
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}>{mappingsExportData ? "✕ CLOSE" : "⬇ EXPORT MAPPINGS"}</button>
          </summary>

          {/* Mappings export inline */}
          {mappingsExportData && (
            <div style={{ margin: "12px 0", padding: "12px", background: "#0d0d0f", border: "1px solid #1e3a5f", borderRadius: "6px" }}>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px" }}>Click inside → Ctrl+A → Ctrl+C → paste to Claude</div>
              <textarea
                readOnly
                value={mappingsExportData}
                onClick={e => e.target.select()}
                onFocus={e => e.target.select()}
                style={{
                  width: "100%", height: "200px", background: "#111114", color: "#94a3b8",
                  border: "1px solid #1e1e28", borderRadius: "4px", padding: "10px",
                  fontFamily: "'DM Mono'", fontSize: "10px", resize: "vertical", boxSizing: "border-box",
                }} />
            </div>
          )}

          {/* Add Archetype Button + Form */}
          <div style={{ marginBottom: "16px" }}>
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                disabled={status === "matching" || status === "parsing"}
                style={{
                  padding: "6px 16px",
                  background: (status === "matching" || status === "parsing") ? "#1a1a1a" : "#0a1a2e",
                  color: (status === "matching" || status === "parsing") ? "#334155" : "#60a5fa",
                  border: "1px solid " + ((status === "matching" || status === "parsing") ? "#2a2a2a" : "#1e3a5f"),
                  borderRadius: "6px", fontSize: "11px", letterSpacing: "1px",
                  fontFamily: "'DM Mono'", cursor: (status === "matching" || status === "parsing") ? "not-allowed" : "pointer",
                }}>+ ADD NEW ARCHETYPE {(status === "matching" || status === "parsing") ? "(unavailable during run)" : ""}</button>
            ) : (
              <div style={{ background: "#0a1a2e", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "16px", maxWidth: "480px" }}>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: "14px", letterSpacing: "2px", color: "#60a5fa", marginBottom: "12px" }}>{editingArchetypeIdx !== null ? "EDIT ARCHETYPE" : "NEW MOC ARCHETYPE"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "#475569", letterSpacing: "1px", marginBottom: "3px" }}>PART NUMBER (5-digit)</div>
                    <input value={newPartNumber} onChange={e => setNewPartNumber(e.target.value)}
                      placeholder="e.g. 10501"
                      style={{ width: "100%", padding: "7px 10px", background: "#0d0d0f", color: "#e2e8f0",
                        border: "1px solid #1e3a5f", borderRadius: "4px", fontSize: "12px",
                        fontFamily: "'DM Mono'", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#475569", letterSpacing: "1px", marginBottom: "3px" }}>PRODUCT NAME</div>
                    <input value={newPartName} onChange={e => setNewPartName(e.target.value)}
                      placeholder="e.g. FRESH A/C AEROSOL 5OZ"
                      style={{ width: "100%", padding: "7px 10px", background: "#0d0d0f", color: "#e2e8f0",
                        border: "1px solid #1e3a5f", borderRadius: "4px", fontSize: "12px",
                        fontFamily: "'DM Mono'", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#475569", letterSpacing: "1px", marginBottom: "3px" }}>INCENTIVE ($) — optional</div>
                    <input value={newIncentive} onChange={e => setNewIncentive(e.target.value)}
                      placeholder="e.g. 5"
                      style={{ width: "100%", padding: "7px 10px", background: "#0d0d0f", color: "#e2e8f0",
                        border: "1px solid #1e3a5f", borderRadius: "4px", fontSize: "12px",
                        fontFamily: "'DM Mono'", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <button onClick={handleAddArchetype} style={{
                      padding: "6px 18px", background: "#0a2a1a", color: "#22c55e",
                      border: "1px solid #16a34a", borderRadius: "4px",
                      fontSize: "11px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                    }}>{editingArchetypeIdx !== null ? "✓ SAVE CHANGES" : "✓ SAVE ARCHETYPE"}</button>
                    <button onClick={() => { setShowAddForm(false); setNewPartNumber(""); setNewPartName(""); setNewIncentive(""); setEditingArchetypeIdx(null); }} style={{
                      padding: "6px 14px", background: "#1a1a1a", color: "#475569",
                      border: "1px solid #2a2a2a", borderRadius: "4px",
                      fontSize: "11px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
                    }}>CANCEL</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "8px" }}>
            {MOC_MAPPINGS.map(m => (
              <div key={m.barePartNumber} style={{ background: "#0d0d0f", border: "1px solid #1e1e28", borderRadius: "6px", padding: "10px 14px", fontSize: "11px" }}>
                <div style={{ color: "#e65c00", letterSpacing: "1px" }}>{m.barePartNumber}</div>
                <div style={{ color: "#94a3b8", marginTop: "2px" }}>{m.manufacturerPart}</div>
                {m.incentive > 0 && <div style={{ color: "#22c55e", marginTop: "2px", fontSize: "10px" }}>${m.incentive} incentive</div>}
              </div>
            ))}
            {customArchetypes.map((m, i) => (
              <div key={"custom-" + i} style={{ background: "#0d0d0f", border: "1px solid #1e3a5f", borderRadius: "6px", padding: "10px 14px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#60a5fa", letterSpacing: "1px" }}>{m.barePartNumber}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      disabled={status === "matching" || status === "parsing"}
                      onClick={() => {
                        if (status === "matching" || status === "parsing") return;
                        setEditingArchetypeIdx(i);
                        const namePart = m.manufacturerPart.split(" - ").slice(1).join(" - ");
                        setNewPartNumber(m.barePartNumber);
                        setNewPartName(namePart);
                        setNewIncentive(String(m.incentive || ""));
                        setShowAddForm(true);
                      }} style={{
                        padding: "2px 8px",
                        background: (status === "matching" || status === "parsing") ? "#1a1a1a" : "#0a1a2e",
                        color: (status === "matching" || status === "parsing") ? "#334155" : "#60a5fa",
                        border: "1px solid " + ((status === "matching" || status === "parsing") ? "#2a2a2a" : "#1e3a5f"),
                        borderRadius: "3px", fontSize: "9px", letterSpacing: "1px",
                        fontFamily: "'DM Mono'",
                        cursor: (status === "matching" || status === "parsing") ? "not-allowed" : "pointer",
                      }}>✎ EDIT</button>
                    <span style={{ fontSize: "9px", color: "#1e3a5f", letterSpacing: "1px" }}>CUSTOM ★</span>
                  </div>
                </div>
                <div style={{ color: "#94a3b8", marginTop: "2px" }}>{m.manufacturerPart}</div>
                {m.incentive > 0 && <div style={{ color: "#22c55e", marginTop: "2px", fontSize: "10px" }}>${m.incentive} incentive</div>}
              </div>
            ))}
            {approvedMappings.map((m, i) => (
              <div key={"approved-" + i} style={{ background: "#0d0d0f", border: "1px solid #065f46", borderRadius: "6px", padding: "10px 14px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#34d399", letterSpacing: "1px" }}>{m.dmsSku}</div>
                  <span style={{ fontSize: "9px", color: "#065f46", letterSpacing: "1px" }}>DEALER</span>
                </div>
                <div style={{ color: "#64748b", fontSize: "10px", marginTop: "1px" }}>{m.dmsPartName}</div>
                <div style={{ color: "#94a3b8", marginTop: "2px" }}>→ {m.manufacturerPart}</div>
              </div>
            ))}
          </div>

          {/* Alias Review Panel */}
          {Object.keys(aliasEntries).length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "11px", color: "#475569", letterSpacing: "1.5px", marginBottom: "12px", paddingTop: "16px", borderTop: "1px solid #1e1e28" }}>
                CAPTURED ALIASES — click ✕ to remove any incorrect entry
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Object.entries(aliasEntries).sort(([a],[b]) => a.localeCompare(b)).map(([bare, entries]) => {
                  const archetype = allMappings.find(m => m.barePartNumber === bare);
                  if (!entries.length) return null;
                  return (
                    <div key={bare} style={{ background: "#0d0d0f", border: "1px solid #1e1e28", borderRadius: "6px", padding: "10px 14px" }}>
                      <div style={{ fontSize: "11px", color: "#e65c00", letterSpacing: "1px", marginBottom: "8px" }}>
                        {bare} — {archetype ? archetype.manufacturerPart : "unknown"}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {entries.map((entry, ei) => (
                          <div key={ei} style={{
                            display: "flex", alignItems: "center", gap: "4px",
                            padding: "3px 8px", borderRadius: "4px", fontSize: "10px",
                            background: entry.origin === "exact_auto" ? "#0a1a0e" : "#0a1a2e",
                            border: "1px solid " + (entry.origin === "exact_auto" ? "#065f46" : "#1e3a5f"),
                            color: entry.origin === "exact_auto" ? "#34d399" : "#60a5fa",
                          }}>
                            <span style={{ fontFamily: "'DM Mono'" }}>{entry.name}</span>
                            <span style={{ fontSize: "9px", opacity: 0.5, marginLeft: "2px" }}>
                              {entry.origin === "exact_auto" ? "AUTO" : "APPROVED"}
                            </span>
                            <button onClick={() => removeAlias(bare, entry.name)} style={{
                              marginLeft: "4px", background: "none", border: "none",
                              color: "#f87171", cursor: "pointer", fontSize: "11px",
                              padding: "0 2px", lineHeight: 1,
                            }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </details>
      </div>

      {/* ── PIN DIALOG ────────────────────────────────────────────────── */}
      {pinPrompt && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{ background: "#111114", border: "1px solid #991b1b", borderRadius: "12px", padding: "28px 32px", minWidth: "320px" }}>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: "18px", letterSpacing: "2px", color: "#ef4444", marginBottom: "4px" }}>BLOCK SKU PERMANENTLY</div>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "16px" }}>
              This will permanently block <span style={{ color: "#e2e8f0" }}>{pinPrompt.sku}</span> from future matching.
            </div>
            <div style={{ fontSize: "10px", color: "#475569", letterSpacing: "1px", marginBottom: "6px" }}>ADMIN PIN</div>
            <input
              type="password"
              value={pinValue}
              onChange={e => { setPinValue(e.target.value); setPinError(false); }}
              onKeyDown={e => e.key === "Enter" && handleRejectForeverConfirm()}
              placeholder="Enter PIN"
              style={{
                width: "100%", padding: "8px 12px", background: "#0d0d0f",
                color: "#e2e8f0", border: "1px solid " + (pinError ? "#dc2626" : "#1e1e28"),
                borderRadius: "6px", fontSize: "13px", fontFamily: "'DM Mono'",
                boxSizing: "border-box", marginBottom: "6px",
              }} />
            {pinError && <div style={{ fontSize: "10px", color: "#f87171", marginBottom: "8px" }}>Incorrect PIN</div>}
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button onClick={handleRejectForeverConfirm} style={{
                flex: 1, padding: "8px", background: "#2a0505", color: "#ef4444",
                border: "1px solid #991b1b", borderRadius: "6px",
                fontSize: "11px", letterSpacing: "1px", fontFamily: "'DM Mono'", cursor: "pointer",
              }}>⛔ CONFIRM BLOCK</button>
              <button onClick={() => { setPinPrompt(null); setPinValue(""); setPinError(false); }} style={{
                padding: "8px 16px", background: "#1a1a1a", color: "#475569",
                border: "1px solid #2a2a2a", borderRadius: "6px",
                fontSize: "11px", fontFamily: "'DM Mono'", cursor: "pointer",
              }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ACCURACY TRACKING ──────────────────────────────────────────── */}
      {accuracyLog.length > 0 && (() => {
        const CATEGORIES = ["EXACT","FUZZY_HIGH","FUZZY_MEDIUM","AI_HIGH","AI_MEDIUM","AI_LOW"];
        const stats = CATEGORIES.map(cat => {
          const entries  = accuracyLog.filter(e => e.category === cat);
          const total    = entries.length;
          const approved = entries.filter(e => e.outcome === "approved").length;
          const accuracy = total > 0 ? (approved / total * 100).toFixed(1) : null;
          const milestone = total >= 500 ? 500 : total >= 100 ? 100 : null;
          const ready    = accuracy !== null && parseFloat(accuracy) >= 99 && milestone !== null;
          return { cat, total, approved, accuracy, ready };
        }).filter(s => s.total > 0);

        return (
          <div style={{ padding: "0 32px 32px", maxWidth: "1400px", margin: "0 auto" }}>
            <details style={{ background: "#111114", border: "1px solid #1e1e28", borderRadius: "8px", padding: "16px 20px" }}>
              <summary style={{ cursor: "pointer", fontSize: "11px", color: "#475569", letterSpacing: "1.5px", padding: "4px 0" }}>
                ACCURACY TRACKING — {accuracyLog.length} total decisions logged
              </summary>
              <div style={{ marginTop: "16px", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e1e28" }}>
                      {["CATEGORY","TOTAL","APPROVED","ACCURACY","STATUS"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#475569", fontSize: "10px", letterSpacing: "1.5px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map(({ cat, total, approved, accuracy, ready }) => (
                      <tr key={cat} style={{ borderBottom: "1px solid #16161e" }}>
                        <td style={{ padding: "10px 12px", color: "#e65c00", fontFamily: "'DM Mono'", letterSpacing: "1px" }}>{cat.replace("_"," ")}</td>
                        <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{total}</td>
                        <td style={{ padding: "10px 12px", color: "#22c55e" }}>{approved}</td>
                        <td style={{ padding: "10px 12px" }}>
                          {accuracy !== null ? (
                            <span style={{
                              color: parseFloat(accuracy) >= 99 ? "#22c55e" : parseFloat(accuracy) >= 90 ? "#f59e0b" : "#f87171"
                            }}>{accuracy}%</span>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {ready
                            ? <span style={{ padding: "2px 8px", background: "#0a2a1a", color: "#22c55e", border: "1px solid #166534", borderRadius: "4px", fontSize: "10px", letterSpacing: "1px" }}>READY — {total >= 500 ? "500+" : "100+"}</span>
                            : <span style={{ color: "#334155", fontSize: "10px" }}>BUILDING ({total < 100 ? 100 - total + " to milestone" : "99% threshold"})</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* One-time alert banner */}
            {accuracyAlert && (
              <div style={{ marginTop: "12px", background: "#0a1a2e", border: "1px solid #1e3a5f", borderRadius: "8px",
                padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "10px", color: "#60a5fa", letterSpacing: "1.5px", marginBottom: "4px" }}>ACCURACY MILESTONE REACHED</div>
                  <div style={{ fontSize: "12px", color: "#e2e8f0" }}>{accuracyAlert}</div>
                </div>
                <button onClick={() => setAccuracyAlert(null)} style={{
                  padding: "4px 12px", background: "none", color: "#475569",
                  border: "1px solid #1e1e28", borderRadius: "4px",
                  fontSize: "10px", fontFamily: "'DM Mono'", cursor: "pointer", marginLeft: "16px",
                }}>DISMISS</button>
              </div>
            )}
          </div>
        );
      })()}
      {/* ── RUN HISTORY ────────────────────────────────────────────────── */}
      {runHistory.length > 0 && (
        <div style={{ padding: "0 32px 32px", maxWidth: "1400px", margin: "0 auto" }}>
          <details style={{ background: "#111114", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "16px 20px" }}>
            <summary style={{ cursor: "pointer", fontSize: "11px", color: "#60a5fa", letterSpacing: "1.5px", padding: "4px 0" }}>
              EXACT MATCH % TREND — {runHistory.length} runs logged
            </summary>
            <div style={{ marginTop: "16px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e1e28" }}>
                    {["DATE","DEALER","TOTAL","EXACT","EXACT %","STATUS"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#475569", fontSize: "10px", letterSpacing: "1.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...runHistory].reverse().map((run, i) => {
                    const pct     = run.exactPct;
                    const pctClr  = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#f87171";
                    const statusLabel = pct >= 80 ? "STRONG" : pct >= 60 ? "BUILDING" : "EARLY";
                    const statusBg    = pct >= 80 ? "#0a2a1a" : pct >= 60 ? "#1a1505" : "#1a0808";
                    const statusBdr   = pct >= 80 ? "#166534" : pct >= 60 ? "#713f12" : "#7f1d1d";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #16161e" }}>
                        <td style={{ padding: "8px 12px", color: "#475569", fontSize: "10px" }}>
                          {new Date(run.date).toLocaleDateString()} {new Date(run.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#94a3b8", fontFamily: "'DM Mono'" }}>{run.dealer || "—"}</td>
                        <td style={{ padding: "8px 12px", color: "#64748b" }}>{run.total}</td>
                        <td style={{ padding: "8px 12px", color: "#60a5fa" }}>{run.exact}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ color: pctClr, fontWeight: "500" }}>{pct}%</span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ padding: "2px 8px", background: statusBg, color: pctClr, border: "1px solid " + statusBdr, borderRadius: "4px", fontSize: "10px", letterSpacing: "1px" }}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {/* ── BLOCKED SKUs ───────────────────────────────────────────────── */}
      {blockedSkus.length > 0 && (
        <div style={{ padding: "0 32px 32px", maxWidth: "1400px", margin: "0 auto" }}>
          <details style={{ background: "#111114", border: "1px solid #991b1b", borderRadius: "8px", padding: "16px 20px" }}>
            <summary style={{ cursor: "pointer", fontSize: "11px", color: "#ef4444", letterSpacing: "1.5px", padding: "4px 0" }}>
              BLOCKED SKUs — {blockedSkus.length} permanently excluded
            </summary>
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {blockedSkus.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#0d0d0f", border: "1px solid #1e1e28", borderRadius: "6px", padding: "8px 14px" }}>
                  <div>
                    <span style={{ color: "#ef4444", fontFamily: "'DM Mono'", fontSize: "12px" }}>{b.sku}</span>
                    {b.partName && <span style={{ color: "#475569", fontSize: "11px", marginLeft: "12px" }}>{b.partName}</span>}
                    <span style={{ color: "#334155", fontSize: "10px", marginLeft: "12px" }}>{new Date(b.blockedAt).toLocaleDateString()}</span>
                  </div>
                  <button onClick={() => handleUnblockSku(b.sku)} style={{
                    padding: "3px 10px", background: "#0a1a0e", color: "#22c55e",
                    border: "1px solid #166534", borderRadius: "4px",
                    fontSize: "10px", fontFamily: "'DM Mono'", cursor: "pointer",
                  }}>UNBLOCK</button>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
