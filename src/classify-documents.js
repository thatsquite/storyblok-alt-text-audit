import fs from "node:fs/promises";

const usagePath = "output/asset-usage.json";
const folderPathsPath = "output/folder-paths.json";
const projectsConfigPath = "config/projects.json";
const outputPath = "output/pdf-tag-audit.json";

const documentMimeTypes = new Set(["application/pdf"]);

const regionCountries = {
  Africa: [
    "Benin",
    "Burkina Faso",
    "Burundi",
    "Ethiopia",
    "Ghana",
    "Kenya",
    "Mali",
    "Mozambique",
    "Niger",
    "Nigeria",
    "Rwanda",
    "South Sudan",
    "Tanzania",
    "Uganda",
    "Zambia",
    "Zimbabwe",
  ],
  Asia: [
    "Bangladesh",
    "Bhutan",
    "Cambodia",
    "Indonesia",
    "Lao PDR",
    "Mekong",
    "Nepal",
    "Vietnam",
  ],
};

const countryAliases = new Map([
  ["lao pdr", "Lao PDR"],
  ["laos", "Lao PDR"],
  ["lao", "Lao PDR"],
  ["viet nam", "Vietnam"],
  ["vietnam", "Vietnam"],
  ["burkina", "Burkina Faso"],
  ["south sudan", "South Sudan"],
  ["ethiopie", "Ethiopia"],
  ["ouganda", "Uganda"],
  ["tanzanie", "Tanzania"],
  ["mozambique", "Mozambique"],
  ["cambodge", "Cambodia"],
  ["nepal", "Nepal"],
  ["bhoutan", "Bhutan"],
  ["sahel", "Mali"],
]);

const themeSectorMap = {
  "Agri-food": "Agri-Food",
  Diets: "Agri-Food",
  Pastoralism: "Agri-Food",
  WASH: "Water",
  "Urban water": "Water",
  Irrigation: "Water",
  Energy: "Energy",
  "Clean cooking": "Energy",
};

const contextMarkers = [
  "snv",
  "project",
  "programme",
  "program",
  "projet",
  "phase",
  "annual",
  "report",
  "rapport",
  "brief",
  "factsheet",
  "study",
  "etude",
  "evaluation",
  "endline",
  "baseline",
  "midterm",
  "mid term",
];

const publicationTypeRules = [
  {
    tag: "Annual report",
    patterns: [
      "annual report",
      "annualreport",
      "rapport annuel",
      "rapportannuel",
      "informe anual",
      "relatorio anual",
    ],
  },
  {
    tag: "Project snapshot",
    patterns: ["project snapshot"],
  },
  {
    tag: "Capability statement",
    patterns: ["capability statement"],
  },
  {
    tag: "Factsheet",
    patterns: [
      "factsheet",
      "fact sheet",
      "fiche",
      "fiche de capitalisation",
      "fichedecapitalisation",
      "fiche technique",
      "ficha",
    ],
  },
  {
    tag: "Policy brief",
    patterns: ["policy brief", "policybrief", "note de politique"],
  },
  {
    tag: "Learning brief",
    patterns: [
      "learning brief",
      "learningbrief",
      "learning summary",
      "note d apprentissage",
      "resume de l apprentissage",
      "resume d apprentissage",
    ],
  },
  {
    tag: "Case study",
    patterns: [
      "case study",
      "casestudy",
      "etude de cas",
      "etudes de cas",
      "estudio de caso",
    ],
  },
  {
    tag: "Evaluation",
    patterns: [
      "evaluation",
      "midterm review",
      "mid term review",
      "endline",
      "baseline",
      "revue a mi parcours",
    ],
  },
  {
    tag: "Research report",
    patterns: [
      "research",
      "study report",
      "assessment",
      "scan",
      "analysis",
      "recherche",
      "diagnostic",
      "etude",
      "etude comparative",
      "note technique",
      "rapport technique",
      "rapport synthetique",
      "rapport de comparaison",
      "analyse comparative",
      "principaux resultats",
    ],
  },
  {
    tag: "Manual",
    patterns: [
      "manual",
      "handbook",
      "guideline",
      "guide",
      "guide pratique",
      "manuel",
      "vademecum",
    ],
  },
  {
    tag: "Toolkit",
    patterns: [
      "toolkit",
      "tool kit",
      "boite outils",
      "boite a outils",
      "boiteoutils",
      "outil d analyse",
      "outil",
      "caja de herramientas",
    ],
  },
  {
    tag: "Brochure",
    patterns: ["brochure", "leaflet", "flyer", "depliant", "plaquette"],
  },
  {
    tag: "Newsletter",
    patterns: ["newsletter", "bulletin", "lettre d information"],
  },
  {
    tag: "Presentation",
    patterns: ["presentation", "slides", "webinar", "diaporama", "speaker"],
  },
  {
    tag: "Terms of reference",
    patterns: ["terms of reference", "tor", "termes de reference"],
  },
  {
    tag: "Request for proposals",
    patterns: [
      "request for proposal",
      "rfp",
      "rfi",
      "call for proposal",
      "expression of interest",
      "invitation to tender",
      "request for quotation",
      "rfq",
      "appel d offres",
      "appel a propositions",
      "avis de manifestation d interet",
    ],
  },
  {
    tag: "Financial report",
    patterns: [
      "financial statement",
      "financial report",
      "audit",
      "rapport financier",
      "dealbook",
    ],
  },
  {
    tag: "Position paper",
    patterns: [
      "position paper",
      "discussion paper",
      "working paper",
      "document de travail",
      "document de position",
    ],
  },
  {
    tag: "White paper",
    patterns: ["white paper", "whitepaper", "livre blanc"],
  },
  {
    tag: "Impact story",
    patterns: [
      "impact story",
      "histoires impact",
      "histoire impact",
      "histoires d impact",
      "success story",
      "story of change",
      "human interest story",
      "temoignage",
    ],
  },
  {
    tag: "Strategy",
    patterns: [
      "strategy",
      "strategic plan",
      "strategic priorities",
      "strategic framework",
      "roadmap",
      "strategie",
      "estrategia",
      "estrategias",
      "synthese",
      "plan strategique",
      "feuille de route",
    ],
  },
  {
    tag: "Lessons learned",
    patterns: [
      "lessons learned",
      "lessons learnt",
      "lessons from",
      "key lessons",
      "reflections",
      "lecons apprises",
      "capitalisation",
    ],
  },
  {
    tag: "Workshop report",
    patterns: [
      "workshop",
      "closing workshop",
      "learning event",
      "conference",
      "conference report",
      "atelier",
      "rencontres",
      "compte rendu",
      "proceedings",
    ],
  },
  {
    tag: "Value proposition",
    patterns: [
      "value proposition",
      "positioning",
      "positioning paper",
      "proposition de valeur",
    ],
  },
  {
    tag: "Compendium",
    patterns: ["compendium", "compilation", "anthology"],
  },
  {
    tag: "FAQ",
    patterns: [
      "faq",
      "faqs",
      "frequently asked questions",
      "questions frequentes",
    ],
  },
  {
    tag: "Legal or administrative document",
    patterns: [
      "chamber of commerce",
      "disclosure",
      "declaration",
      "notice",
      "certificate",
      "registration",
      "general conditions",
      "code of conduct",
    ],
  },
  {
    tag: "Governance document",
    patterns: [
      "statuten",
      "statutes",
      "kamer van koophandel",
      "kvk",
      "uittreksel",
      "anbi",
      "jaarrekening",
      "bestuursverslag",
      "bankafschrift",
      "aanvraag",
      "begroting",
      "publicatieplicht",
      "pubplicht",
      "directieleden",
      "raad van toezicht",
      "raad van bestuur",
      "modern slavery",
      "anti human trafficking",
      "articles of association",
      "board report",
      "governance statement",
      "integrity policy",
      "whistleblower",
      "safeguarding",
      "safeguarding policy",
      "child protection",
      "pseah",
      "tax exemption",
    ],
  },
  {
    tag: "Consultancy assignment",
    patterns: [
      "assignment",
      "consultant",
      "consultancy",
      "scope of work",
      "vacancy",
      "job description",
      "proposal writers",
      "maintenance services",
      "development services",
    ],
  },
  {
    tag: "Infosheet",
    patterns: ["infosheet", "info sheet", "information sheet", "one pager"],
  },
  {
    tag: "Snapshot",
    patterns: ["snapshot", "at a glance", "overview"],
  },
  {
    tag: "Contract document",
    patterns: [
      "contract",
      "agreement",
      "memorandum of understanding",
      "mou",
      "addendum",
      "amendment",
    ],
  },
];

const themeRules = [
  {
    tag: "Agri-food",
    patterns: [
      "agri food",
      "agrifood",
      "agriculture",
      "agricultural",
      "agri",
      "agriculteurs",
      "farming",
      "farmer",
      "crop",
      "horticulture",
      "dairy",
      "livestock",
      "seed",
      "coffee",
      "cocoa",
      "rice",
      "maize",
      "soy",
      "soya",
      "soybean",
      "vegetable",
      "poultry",
      "aquaculture",
      "fisheries",
      "palm oil",
      "oil palm",
      "value chain",
      "food system",
      "food security",
      "post harvest",
      "smallholder",
    ],
  },
  {
    tag: "WASH",
    patterns: [
      "wash",
      "sanitation",
      "hygiene",
      "toilet",
      "latrine",
      "handwashing",
      "faecal sludge",
      "fecal sludge",
      "open defecation",
      "odf",
      "ssh4a",
      "safely managed sanitation",
      "menstrual",
      "assainissement",
      "emptying",
      "on site facilities",
    ],
  },
  {
    tag: "Urban water",
    patterns: [
      "urban water",
      "urban sanitation",
      "water supply",
      "water utility",
      "water services",
      "wastewater",
      "waste water",
      "solid waste",
      "faecal sludge treatment",
      "fstp",
      "drinking water",
      "water kiosk",
    ],
  },
  {
    tag: "Irrigation",
    patterns: [
      "irrigation",
      "solar irrigation",
      "drip irrigation",
      "water pump",
      "borehole",
      "water harvesting",
      "smallholder irrigation",
    ],
  },
  {
    tag: "Energy",
    patterns: [
      "energy",
      "biogas",
      "biodigester",
      "bio digester",
      "bioslurry",
      "solar",
      "renewable",
      "off grid",
      "mini grid",
      "minigrid",
      "electrification",
      "electricity",
      "pico pv",
      "endev",
      "energie",
    ],
  },
  {
    tag: "Clean cooking",
    patterns: [
      "clean cooking",
      "cookstove",
      "cook stove",
      "improved cookstove",
      "ics",
      "cooking energy",
      "electric cooking",
      "ecooking",
      "smoke free",
      "cuisson propre",
    ],
  },
  {
    tag: "Climate",
    patterns: [
      "climate",
      "climate smart",
      "adaptation",
      "mitigation",
      "resilience",
      "resilient",
      "carbon",
      "emission",
      "greenhouse gas",
      "ghg",
      "cop26",
      "cop27",
      "cop28",
      "cop29",
      "cop30",
      "nationally determined contribution",
      "ndc",
      "climatique",
    ],
  },
  {
    tag: "Landscapes",
    patterns: [
      "landscape",
      "forest",
      "forestry",
      "redd",
      "biodiversity",
      "mangrove",
      "agroforestry",
      "watershed",
      "catchment",
      "conservation",
      "reforestation",
      "land use",
      "paysage",
    ],
  },
  {
    tag: "GESI",
    patterns: [
      "gesi",
      "gender",
      "gender equality",
      "social inclusion",
      "women",
      "woman",
      "girls",
      "inclusion",
      "inclusive",
      "disability",
      "empowerment",
      "equity",
      "genre",
      "femmes",
    ],
  },
  {
    tag: "YEE",
    patterns: [
      "yee",
      "youth",
      "youth employment",
      "youth entrepreneurship",
      "employment",
      "jobs",
      "job creation",
      "skills development",
      "oye",
      "entrepreneurship",
      "jeunes",
      "emploi",
    ],
  },
  {
    tag: "Finance",
    patterns: [
      "finance",
      "financing",
      "financial",
      "investment",
      "investor",
      "credit",
      "loan",
      "blended finance",
      "climate finance",
      "results based financing",
      "rbf",
      "microfinance",
      "savings",
      "de risking",
      "business case",
      "impact capital",
      "dealbook",
    ],
  },
  {
    tag: "Markets",
    patterns: [
      "market",
      "market systems",
      "market based",
      "private sector",
      "enterprise",
      "sme",
      "business development",
      "trade",
      "commercialisation",
      "commercialization",
      "supply chain",
      "distribution",
      "public prive",
      "public private",
      "service delivery model",
      "sdm",
      "consommateurs",
      "prestation de services",
    ],
  },
  {
    tag: "Governance",
    patterns: [
      "governance",
      "institutional",
      "institution",
      "advocacy",
      "accountability",
      "policy dialogue",
      "public sector",
      "decentralisation",
      "decentralization",
      "regulation",
      "regulatory",
      "civil society",
      "gouvernance",
      "dialogue",
    ],
  },
  {
    tag: "Digitalisation",
    patterns: [
      "digital",
      "digitalisation",
      "digitalization",
      "digitisation",
      "ict",
      "mobile",
      "data platform",
      "e learning",
      "remote sensing",
      "geospatial",
      "gis",
      "numerique",
      "web development",
    ],
  },
  {
    tag: "Diets",
    patterns: [
      "diet",
      "nutrition",
      "nutritious",
      "nutrition sensitive",
      "malnutrition",
      "stunting",
      "school feeding",
      "food safety",
      "healthy diets",
    ],
  },
  {
    tag: "Nexus",
    patterns: [
      "nexus",
      "water energy food",
      "integrated approach",
      "humanitarian development",
      "systems change",
    ],
  },
  {
    tag: "Pastoralism",
    patterns: [
      "pastoralism",
      "pastoralist",
      "rangeland",
      "herder",
      "cattle",
      "livestock mobility",
      "asal",
      "drylands",
      "pastoralisme",
      "eleveurs",
    ],
  },
];

const languageRules = [
  {
    tag: "English",
    patterns: ["en", "eng", "english", "anglais"],
  },
  {
    tag: "French",
    patterns: [
      "fr",
      "fra",
      "fre",
      "french",
      "francais",
      "francaise",
      "rapport",
      "guide pratique",
      "boite outils",
      "fiche",
      "atelier",
      "synthese",
      "synthetique",
      "capitalisation",
      "assainissement",
      "depliant",
      "gouvernance",
      "jeunes",
      "femmes",
      "energie",
      "numerique",
      "paysage",
      "climatique",
      "recherche",
      "diagnostic",
      "temoignage",
      "manuel",
      "plaquette",
      "etude",
      "etudes",
      "resume",
      "outil",
      "consommateurs",
      "agriculteurs",
      "eleveurs",
      "resultats",
      "comparaison",
      "analyse",
    ],
  },
  {
    tag: "Dutch",
    patterns: [
      "nl",
      "dutch",
      "nederlands",
      "statuten",
      "jaarrekening",
      "bestuursverslag",
      "aanvraag",
      "begroting",
      "uittreksel",
      "bankafschrift",
      "kamer van koophandel",
      "directieleden",
      "samenvatting",
    ],
  },
  {
    tag: "Spanish",
    patterns: ["es", "esp", "spanish", "espanol", "informe", "estrategia"],
  },
  {
    tag: "Portuguese",
    patterns: [
      "pt",
      "por",
      "portuguese",
      "portugues",
      "relatorio",
      "resumida",
      "completa",
    ],
  },
  {
    tag: "Vietnamese",
    patterns: ["vn", "vie", "vi", "vietnamese", "tieng viet"],
  },
  {
    tag: "Khmer",
    patterns: ["kh", "khm", "khmer"],
  },
  {
    tag: "Nepali",
    patterns: ["np", "nep", "nepali"],
  },
  {
    tag: "Bangla",
    patterns: ["bn", "bng", "bangla", "bengali"],
  },
  {
    tag: "Amharic",
    patterns: ["am", "amh", "amharic"],
  },
  {
    tag: "Bahasa Indonesia",
    patterns: ["id", "ind", "bahasa", "indonesian"],
  },
  {
    tag: "Lao",
    patterns: ["lo", "lao language"],
  },
  {
    tag: "Swahili",
    patterns: ["sw", "swahili", "kiswahili"],
  },
];

const mojibakeReplacements = [
  ["\u00c3\u00a9", "e"],
  ["\u00c3\u00a8", "e"],
  ["\u00c3\u00aa", "e"],
  ["\u00c3\u00a0", "a"],
  ["\u00c3\u00a2", "a"],
  ["\u00c3\u00a1", "a"],
  ["\u00c3\u00ad", "i"],
  ["\u00c3\u00ae", "i"],
  ["\u00c3\u00b3", "o"],
  ["\u00c3\u00b4", "o"],
  ["\u00c3\u00ba", "u"],
  ["\u00c3\u00bb", "u"],
  ["\u00c3\u00a7", "c"],
  ["\u00c3\u00b1", "n"],
  ["\u00e2\u0080\u0099", "'"],
  ["\u00e2\u0080\u0093", "-"],
  ["\u00e2\u0080\u0094", "-"],
];

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function writeJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;

  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");

  await fs.rm(filePath, { force: true });
  await fs.rename(temporaryPath, filePath);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function repairEncoding(value) {
  let result = value;

  for (const [broken, fixed] of mojibakeReplacements) {
    result = result.split(broken).join(fixed);
  }

  return result;
}

function decodePercentArtefacts(value) {
  return value
    .replace(/-e2-80-99/gi, " ")
    .replace(/-e2-80-93/gi, " ")
    .replace(/-c3-a9/gi, "e")
    .replace(/-c3-a8/gi, "e")
    .replace(/-c3-aa/gi, "e")
    .replace(/-c3-ab/gi, "e")
    .replace(/-c3-a0/gi, "a")
    .replace(/-c3-a2/gi, "a")
    .replace(/-c3-a4/gi, "a")
    .replace(/-c3-a7/gi, "c")
    .replace(/-c3-ae/gi, "i")
    .replace(/-c3-af/gi, "i")
    .replace(/-c3-b4/gi, "o")
    .replace(/-c3-b6/gi, "o")
    .replace(/-c3-b9/gi, "u")
    .replace(/-c3-bb/gi, "u")
    .replace(/-c3-bc/gi, "u")
    .replace(/-c3-b1/gi, "n")
    .replace(/-27/g, " ")
    .replace(/-22/g, " ")
    .replace(/-28/g, " ")
    .replace(/-29/g, " ")
    .replace(/-2c/gi, " ")
    .replace(/-3a/gi, " ")
    .replace(/-20/g, " ");
}

function removeAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toComparable(value) {
  return removeAccents(
    decodePercentArtefacts(repairEncoding(normalizeText(value))),
  )
    .toLowerCase()
    .replace(/[_\-\u2013\u2014]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues(values) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(comparable, phrase, allowPlural = false) {
  const normalized = toComparable(phrase);

  if (!normalized) {
    return false;
  }

  const suffix = allowPlural ? "(?:e?s)?" : "";

  const pattern = new RegExp(
    `(^| )${escapeRegExp(normalized)}${suffix}( |$)`,
    "i",
  );

  return pattern.test(comparable);
}

function matchRules(text, rules, allowPlural = false) {
  const comparable = toComparable(text);
  const matches = [];

  if (!comparable) {
    return matches;
  }

  for (const rule of rules) {
    const isMatch = rule.patterns.some((pattern) =>
      containsPhrase(comparable, pattern, allowPlural),
    );

    if (isMatch) {
      matches.push(rule.tag);
    }
  }

  return uniqueValues(matches);
}

function stripMatchedPhrases(text, rules) {
  let comparable = toComparable(text);

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const normalized = toComparable(pattern);

      if (!normalized) {
        continue;
      }

      const expression = new RegExp(
        `(^| )${escapeRegExp(normalized)}(?:e?s)?( |$)`,
        "gi",
      );

      comparable = comparable.replace(expression, " ");
    }
  }

  return comparable.replace(/\s+/g, " ").trim();
}

function buildCountryIndex(folderPaths) {
  const countryToRegion = new Map();

  for (const [region, countries] of Object.entries(regionCountries)) {
    for (const country of countries) {
      countryToRegion.set(country.toLowerCase(), {
        country,
        region,
      });
    }
  }

  for (const folder of folderPaths) {
    const fullPath = normalizeText(folder.full_path);

    if (!fullPath.startsWith("Photos > ")) {
      continue;
    }

    const parts = fullPath
      .split(">")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length !== 3) {
      continue;
    }

    const region = parts[1];
    const country = parts[2];

    if (!["Africa", "Asia"].includes(region)) {
      continue;
    }

    countryToRegion.set(country.toLowerCase(), {
      country,
      region,
    });
  }

  return countryToRegion;
}

function findCountries(text, countryIndex) {
  const comparable = toComparable(text);

  if (!comparable) {
    return [];
  }

  const matches = [];

  for (const [key, value] of countryIndex.entries()) {
    if (containsPhrase(comparable, key)) {
      matches.push(value);
    }
  }

  for (const [alias, canonical] of countryAliases.entries()) {
    if (containsPhrase(comparable, alias)) {
      const resolved = countryIndex.get(canonical.toLowerCase());

      if (resolved) {
        matches.push(resolved);
      }
    }
  }

  const unique = new Map();

  for (const match of matches) {
    unique.set(match.country, match);
  }

  return Array.from(unique.values());
}

function hasContextMarker(comparable, countryIndex) {
  const hasMarker = contextMarkers.some((marker) =>
    containsPhrase(comparable, marker),
  );

  if (hasMarker) {
    return true;
  }

  for (const key of countryIndex.keys()) {
    if (containsPhrase(comparable, key)) {
      return true;
    }
  }

  return false;
}

function findProjects(text, projectVocabulary, countryIndex) {
  const comparable = toComparable(text);

  if (!comparable) {
    return [];
  }

  const contextAvailable = hasContextMarker(comparable, countryIndex);

  const unique = new Map();

  for (const project of projectVocabulary) {
    const aliases = Array.isArray(project.aliases) ? project.aliases : [];

    const isMatch = aliases.some((alias) => containsPhrase(comparable, alias));

    if (!isMatch) {
      continue;
    }

    if (project.requireContext && !contextAvailable) {
      continue;
    }

    unique.set(project.tag, project);
  }

  return Array.from(unique.values());
}

function findYears(text) {
  const comparable = normalizeText(text);
  const matches = comparable.match(/\b(19|20)\d{2}\b/g) ?? [];

  const currentYear = new Date().getFullYear();

  return uniqueValues(
    matches.filter((year) => {
      const value = Number(year);
      return value >= 1990 && value <= currentYear + 1;
    }),
  );
}

function getDocumentCategory(contentTypes, folderPath) {
  const types = contentTypes.map((value) => value.toLowerCase());

  const folder = toComparable(folderPath);

  if (types.includes("librarypage")) {
    return "Publication";
  }

  if (types.includes("tenderpage")) {
    return "Procurement document";
  }

  if (folder.includes("procurement")) {
    return "Procurement document";
  }

  if (folder.includes("hidden pdfs")) {
    return "Hidden document";
  }

  if (folder.includes("knowledge center")) {
    return "Publication";
  }

  if (types.length > 0) {
    return "Other linked document";
  }

  return "Uncategorized document";
}

function getStoryContext(asset) {
  const stories = Array.isArray(asset.stories_using_asset)
    ? asset.stories_using_asset
    : [];

  return {
    storyNames: uniqueValues(stories.map((story) => story?.story_name)),
    storySlugs: uniqueValues(stories.map((story) => story?.full_slug)),
    contentTypes: uniqueValues(stories.map((story) => story?.content_type)),
    publishedCount: stories.filter((story) => story?.published).length,
  };
}

function classifyDocument(asset, countryIndex, projectVocabulary) {
  const context = getStoryContext(asset);
  const filename = normalizeText(asset.filename);
  const folderPath = normalizeText(asset.folder_path);

  const storyText = [...context.storyNames, ...context.storySlugs].join(" ");

  const filenameText = filename.replace(/\.[a-z0-9]+$/i, "");

  const documentCategory = getDocumentCategory(
    context.contentTypes,
    folderPath,
  );

  const countriesFromStory = findCountries(storyText, countryIndex);

  const countriesFromFilename = findCountries(filenameText, countryIndex);

  const countriesFromFolder = findCountries(folderPath, countryIndex);

  const countryMatches = [
    ...countriesFromStory,
    ...countriesFromFilename,
    ...countriesFromFolder,
  ];

  const uniqueCountries = new Map();

  for (const match of countryMatches) {
    uniqueCountries.set(match.country, match);
  }

  const countries = Array.from(uniqueCountries.values());

  const countrySource =
    countriesFromStory.length > 0
      ? "linked_story"
      : countriesFromFilename.length > 0
        ? "filename"
        : countriesFromFolder.length > 0
          ? "asset_folder"
          : "";

  const publicationTypes = uniqueValues([
    ...matchRules(filenameText, publicationTypeRules, true),
    ...matchRules(storyText, publicationTypeRules, true),
  ]);

  const storyThemeText = stripMatchedPhrases(storyText, publicationTypeRules);

  const filenameThemeText = stripMatchedPhrases(
    filenameText,
    publicationTypeRules,
  );

  const themes = uniqueValues([
    ...matchRules(storyThemeText, themeRules, true),
    ...matchRules(filenameThemeText, themeRules, true),
  ]);

  const projectMatches = [
    ...findProjects(storyText, projectVocabulary, countryIndex),
    ...findProjects(filenameText, projectVocabulary, countryIndex),
  ];

  const uniqueProjects = new Map();

  for (const match of projectMatches) {
    uniqueProjects.set(match.tag, match);
  }

  const projectRecords = Array.from(uniqueProjects.values());

  const projects = projectRecords.map((project) => project.tag);

  const sectorsFromProjects = uniqueValues(
    projectRecords.map((project) => project.sector),
  );

  const sectorsFromThemes = uniqueValues(
    themes.map((theme) => themeSectorMap[theme] || ""),
  );

  const sectors =
    sectorsFromProjects.length > 0 ? sectorsFromProjects : sectorsFromThemes;

  const sectorSource =
    sectorsFromProjects.length > 0
      ? "linked_project"
      : sectorsFromThemes.length > 0
        ? "theme"
        : "";

  const languages = uniqueValues([
    ...matchRules(filenameText, languageRules),
    ...matchRules(storyText, languageRules),
  ]);

  const yearsFromFilename = findYears(filenameText);
  const yearsFromStory = findYears(storyText);

  const years = uniqueValues([...yearsFromFilename, ...yearsFromStory]);

  const yearSource =
    yearsFromFilename.length > 0
      ? "filename"
      : yearsFromStory.length > 0
        ? "linked_story"
        : "";

  const tagSources = [];

  if (context.storyNames.length > 0) {
    tagSources.push("linked_story");
  }

  if (
    publicationTypes.length > 0 ||
    projects.length > 0 ||
    years.length > 0 ||
    languages.length > 0
  ) {
    tagSources.push("filename");
  }

  if (folderPath) {
    tagSources.push("asset_folder");
  }

  const proposedTags = uniqueValues([
    documentCategory,
    ...countries.map((match) => match.country),
    ...uniqueValues(countries.map((match) => match.region)),
    ...publicationTypes,
    ...themes,
    ...projects,
    ...sectors,
    ...years,
    ...languages,
  ]);

  const hasAnyTag =
    countries.length > 0 ||
    projects.length > 0 ||
    themes.length > 0 ||
    publicationTypes.length > 0 ||
    sectors.length > 0;

  const reviewReasons = [];

  if (!hasAnyTag) {
    reviewReasons.push("No tag identified");
  }

  if (asset.usage_count === 0) {
    reviewReasons.push("No detected story usage");
  }

  if (context.storyNames.length === 0) {
    reviewReasons.push("No linked story title available");
  }

  if (folderPath.toLowerCase().includes("missing folder")) {
    reviewReasons.push("Asset folder could not be resolved");
  }

  if (folderPath.toLowerCase().includes("hidden pdfs")) {
    reviewReasons.push("Asset is stored in the hidden PDFs folder");
  }

  if (countries.length > 2) {
    reviewReasons.push("Several countries identified");
  }

  if (publicationTypes.length > 2) {
    reviewReasons.push("Several publication types identified");
  }

  if (projects.length > 2) {
    reviewReasons.push("Several projects identified");
  }

  if (years.length > 1) {
    reviewReasons.push("Several years identified");
  }

  if (languages.length > 1) {
    reviewReasons.push("Several languages identified");
  }

  if (sectors.length > 1) {
    reviewReasons.push("Several sectors identified");
  }

  const strongSignals =
    (countries.length > 0 ? 1 : 0) +
    (publicationTypes.length === 1 ? 1 : 0) +
    (themes.length > 0 ? 1 : 0) +
    (projects.length > 0 ? 1 : 0) +
    (context.storyNames.length > 0 ? 1 : 0);

  const confidence =
    strongSignals >= 4 ? "high" : strongSignals >= 2 ? "medium" : "low";

  return {
    asset_id: asset.asset_id,
    filename,
    asset_url: normalizeText(asset.asset_url),
    mime_type: normalizeText(asset.mime_type),
    folder_path: folderPath,
    usage_count: asset.usage_count ?? 0,
    reference_count: asset.reference_count ?? 0,
    published_usage_count: context.publishedCount,
    story_names: context.storyNames,
    story_slugs: context.storySlugs,
    content_types: context.contentTypes,
    current_tags: Array.isArray(asset.tags) ? asset.tags : [],
    document_category: documentCategory,
    proposed_countries: countries.map((match) => match.country),
    proposed_regions: uniqueValues(countries.map((match) => match.region)),
    country_source: countrySource,
    proposed_publication_types: publicationTypes,
    proposed_themes: themes,
    proposed_projects: projects,
    proposed_sectors: sectors,
    sector_source: sectorSource,
    proposed_years: years,
    year_source: yearSource,
    proposed_languages: languages,
    proposed_tags: proposedTags,
    tag_count: proposedTags.length,
    has_any_tag: hasAnyTag,
    tag_sources: uniqueValues(tagSources),
    confidence,
    review_required: reviewReasons.length > 0,
    review_reasons: reviewReasons,
    reviewer_decision: "",
    approved_tags: "",
    review_notes: "",
    ready_for_update: "",
  };
}

function countByProperty(records, propertyName) {
  const counts = {};

  for (const record of records) {
    const value = record[propertyName] || "[missing]";
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}

function countByArrayProperty(records, propertyName) {
  const counts = {};

  for (const record of records) {
    const values = Array.isArray(record[propertyName])
      ? record[propertyName]
      : [];

    if (values.length === 0) {
      counts["[none]"] = (counts["[none]"] ?? 0) + 1;
      continue;
    }

    for (const value of values) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }

  return counts;
}

async function main() {
  const usageData = await readJson(usagePath);
  const folderData = await readJson(folderPathsPath);
  const projectVocabulary = await readJson(projectsConfigPath);

  const allAssets = Array.isArray(usageData.assets) ? usageData.assets : [];

  const folderPaths = Array.isArray(folderData.folder_paths)
    ? folderData.folder_paths
    : [];

  if (!Array.isArray(projectVocabulary) || projectVocabulary.length === 0) {
    throw new Error(`No projects found in ${projectsConfigPath}`);
  }

  const countryIndex = buildCountryIndex(folderPaths);

  const documents = allAssets.filter((asset) =>
    documentMimeTypes.has(normalizeText(asset.mime_type).toLowerCase()),
  );

  if (documents.length === 0) {
    throw new Error(`No PDF assets were found in ${usagePath}`);
  }

  const classified = documents.map((asset) =>
    classifyDocument(asset, countryIndex, projectVocabulary),
  );

  const taggedCount = classified.filter((record) => record.has_any_tag).length;

  const summary = {
    generated_at: new Date().toISOString(),
    source_assets: allAssets.length,
    pdf_assets: classified.length,
    documents_with_any_tag: taggedCount,
    documents_with_no_tag: classified.length - taggedCount,
    tag_coverage_percent: Number(
      ((taggedCount / classified.length) * 100).toFixed(1),
    ),
    countries_in_vocabulary: countryIndex.size,
    projects_in_vocabulary: projectVocabulary.length,
    document_category_counts: countByProperty(classified, "document_category"),
    confidence_counts: countByProperty(classified, "confidence"),
    country_counts: countByArrayProperty(classified, "proposed_countries"),
    publication_type_counts: countByArrayProperty(
      classified,
      "proposed_publication_types",
    ),
    theme_counts: countByArrayProperty(classified, "proposed_themes"),
    project_counts: countByArrayProperty(classified, "proposed_projects"),
    sector_counts: countByArrayProperty(classified, "proposed_sectors"),
    sector_source_counts: countByProperty(classified, "sector_source"),
    language_counts: countByArrayProperty(classified, "proposed_languages"),
    documents_with_country: classified.filter(
      (record) => record.proposed_countries.length > 0,
    ).length,
    documents_with_publication_type: classified.filter(
      (record) => record.proposed_publication_types.length > 0,
    ).length,
    documents_with_theme: classified.filter(
      (record) => record.proposed_themes.length > 0,
    ).length,
    documents_with_project: classified.filter(
      (record) => record.proposed_projects.length > 0,
    ).length,
    documents_with_sector: classified.filter(
      (record) => record.proposed_sectors.length > 0,
    ).length,
    documents_requiring_review: classified.filter(
      (record) => record.review_required,
    ).length,
    documents_with_no_usage: classified.filter(
      (record) => record.usage_count === 0,
    ).length,
  };

  await writeJson(outputPath, {
    summary,
    documents: classified,
  });

  console.log("PDF tag classification completed.");
  console.log(`PDF assets classified: ${summary.pdf_assets}`);
  console.log(`Projects in vocabulary: ` + `${summary.projects_in_vocabulary}`);
  console.log("");
  console.log(
    `Documents with at least one tag: ` +
      `${summary.documents_with_any_tag} ` +
      `(${summary.tag_coverage_percent}%)`,
  );
  console.log(`Documents with no tag: ` + `${summary.documents_with_no_tag}`);
  console.log("");
  console.log(
    `Documents with a country: ` + `${summary.documents_with_country}`,
  );
  console.log(
    `Documents with a publication type: ` +
      `${summary.documents_with_publication_type}`,
  );
  console.log(`Documents with a theme: ${summary.documents_with_theme}`);
  console.log(
    `Documents with a project: ` + `${summary.documents_with_project}`,
  );
  console.log(`Documents with a sector: ` + `${summary.documents_with_sector}`);
  console.log(
    `Documents requiring review: ` + `${summary.documents_requiring_review}`,
  );
  console.log(`Saved to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
