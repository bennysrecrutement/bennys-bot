// ============================================================
//  BOT DISCORD BENNY'S — Dashboard complet (/staff)
// ============================================================

const fs = require("fs");
const path = require("path");
const http = require("http");
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
} = require("discord.js");

// --- CONFIG -------------------------------------------------
const TOKEN = (process.env.DISCORD_TOKEN || "").trim().replace(/^["']|["']$/g, "");
const GUILD_ID = (process.env.GUILD_ID || "0").trim();
const SALON_CANDIDATURES_ID = (process.env.SALON_CANDIDATURES_ID || "0").trim();
const SALON_LOGS_ID = (process.env.SALON_LOGS_ID || "0").trim();
const ROLE_RECRUTEUR_ID = (process.env.ROLE_RECRUTEUR_ID || "0").trim();
const PORT = process.env.PORT || 8080;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || "bennys2026";

const DATA_FILE = path.join(__dirname, "bennys_data.json");

const DEFAULT_DATA = {
  ouvert: false,
  effectif: [],
  candidatures: {},
  tarifs: [
    ["Réparation", "1000$"],
    ["Dépannage Sud", "1000$"],
    ["Dépannage Nord", "1400$"],
    ["Kit réparation / nettoyage", "500$"],
  ],
  partenaires: [
    ["Burger Shot", "Partenaire officiel"],
    ["BCSO", "Partenaire officiel"],
  ],
};

function loadData() {
  let data = Object.assign({}, DEFAULT_DATA);
  if (fs.existsSync(DATA_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
      data = Object.assign(data, saved);
    } catch {}
  }
  if (!Array.isArray(data.tarifs) || !data.tarifs.length) data.tarifs = DEFAULT_DATA.tarifs;
  if (!Array.isArray(data.partenaires) || !data.partenaires.length)
    data.partenaires = DEFAULT_DATA.partenaires;
  return data;
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Sauvegarde impossible :", e.message);
  }
}

const POSTES = [
  "Apprenti Mécanicien",
  "Mécanicien",
  "Mécanicien Confirmé",
  "Chef d'Équipe",
  "Directeur Référent",
  "Co-Patron",
  "Patron",
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

let botReady = false;
let botTag = "hors ligne";

async function log(texte) {
  if (!SALON_LOGS_ID || SALON_LOGS_ID === "0") return;
  try {
    const salon = await client.channels.fetch(SALON_LOGS_ID);
    if (salon && salon.isTextBased()) await salon.send(texte);
  } catch {}
}

function candidatureButtons(candidatId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("accept_" + candidatId)
      .setLabel("✅ Accepter")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("refuse_" + candidatId)
      .setLabel("❌ Refuser")
      .setStyle(ButtonStyle.Danger)
  );
}

function hasPermission(member) {
  if (!ROLE_RECRUTEUR_ID || ROLE_RECRUTEUR_ID === "0") return true;
  if (!member || !member.roles) return false;
  return member.roles.cache.has(ROLE_RECRUTEUR_ID);
}

async function sendDM(user, texte) {
  try {
    await user.send(texte);
    return true;
  } catch {
    return false;
  }
}

async function traiterCandidature(candidatId, accepter, guild) {
  const data = loadData();
  const candidature = data.candidatures[candidatId];
  const nomRp = (candidature && candidature.nom_rp) || "candidat";
  const poste = (candidature && candidature.poste) || "Apprenti Mécanicien";

  let membre = null;
  try {
    if (guild) membre = await guild.members.fetch(candidatId);
  } catch {}

  let mpOk = false;

  if (accepter) {
    if (membre) {
      const entry = membre.user.tag + " (" + nomRp + ") — " + poste;
      if (!data.effectif.includes(entry)) data.effectif.push(entry);
    }
    if (candidature) candidature.statut = "accepte";
    saveData(data);

    if (membre) {
      mpOk = await sendDM(
        membre.user,
        "🎉 **Félicitations !**\n" +
          "Ta candidature chez **Benny's Original Motor Works** pour le poste de **" +
          poste +
          "** a été **retenue**.\n" +
          "Un membre de la direction va te contacter très vite. Bienvenue ! 🔧"
      );
    }
  } else {
    if (candidature) candidature.statut = "refuse";
    saveData(data);

    if (membre) {
      mpOk = await sendDM(
        membre.user,
        "❌ **Candidature non retenue**\n" +
          "Après étude de ton dossier, ta candidature chez **Benny's Original Motor Works** " +
          "pour le poste de **" +
          poste +
          "** n'a pas été retenue.\n" +
          "Tu pourras retenter ta chance plus tard. Merci ! 🔧"
      );
    }
  }

  return { nomRp, poste, mpOk };
}

// ============================================================
//  DISCORD
// ============================================================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const parts = interaction.customId.split("_");
  const action = parts[0];
  const candidatId = parts[1];
  if (action !== "accept" && action !== "refuse") return;

  if (!hasPermission(interaction.member)) {
    return interaction.reply({
      content: "❌ Tu n'as pas la permission de traiter les candidatures.",
      ephemeral: true,
    });
  }

  const res = await traiterCandidature(candidatId, action === "accept", interaction.guild);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("done_a")
      .setLabel(action === "accept" ? "✅ Accepté" : "✅ Accepter")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("done_r")
      .setLabel(action === "refuse" ? "❌ Refusé" : "❌ Refuser")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );

  await interaction.update({ components: [disabledRow] });
  await interaction.followUp({
    content:
      (action === "accept"
        ? "✅ Candidature de **" + res.nomRp + "** acceptée."
        : "❌ Candidature de **" + res.nomRp + "** refusée.") +
      (res.mpOk ? "" : " ⚠️ MP impossible (MP fermés)."),
    ephemeral: true,
  });
  await log(
    (action === "accept" ? "✅ " : "❌ ") +
      "Candidature de " + res.nomRp +
      (action === "accept" ? " acceptée" : " refusée") +
      " par " + interaction.user.tag
  );
});

const commands = [
  new SlashCommandBuilder().setName("ouvert").setDescription("Ouvrir le garage"),
  new SlashCommandBuilder().setName("ferme").setDescription("Fermer le garage"),
  new SlashCommandBuilder().setName("recrutement").setDescription("Panel de recrutement"),
  new SlashCommandBuilder().setName("effectif").setDescription("Voir l'effectif"),
  new SlashCommandBuilder().setName("stats").setDescription("Statistiques du garage"),
  new SlashCommandBuilder().setName("partenaires").setDescription("Liste des partenaires"),
  new SlashCommandBuilder().setName("tarifs").setDescription("Tarifs du garage"),
  new SlashCommandBuilder().setName("dashboard").setDescription("Lien du tableau de bord web (staff)"),
  new SlashCommandBuilder()
    .setName("joueur")
    .setDescription("Marquer un joueur en service")
    .addUserOption((o) => o.setName("membre").setDescription("Le joueur").setRequired(true)),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprimer des messages de ce salon (staff)")
    .addIntegerOption((o) =>
      o
        .setName("nombre")
        .setDescription("Nombre de messages a supprimer (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),
].map((c) => c.toJSON());

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;
  const data = loadData();

  if (cmd === "ouvert") {
    data.ouvert = true;
    saveData(data);
    await interaction.reply("🟢 Benny's est **OUVERT**.");
    return log("🟢 Ouvert par " + interaction.user.tag);
  }
  if (cmd === "ferme") {
    data.ouvert = false;
    saveData(data);
    await interaction.reply("🔴 Benny's est **FERMÉ**.");
    return log("🔴 Fermé par " + interaction.user.tag);
  }
  if (cmd === "dashboard") {
    return interaction.reply({
      content:
        "📊 **Tableau de bord Benny's**\n" +
        "https://bennys-bot-production.up.railway.app/staff\n" +
        "_(accès protégé par mot de passe)_",
      ephemeral: true,
    });
  }
  if (cmd === "recrutement") {
    const embed = new EmbedBuilder()
      .setTitle("🔧 Recrutement Benny's")
      .setColor(0xff6a00)
      .setDescription(
        "Postes ouverts :\n" +
          POSTES.map((p) => "• " + p).join("\n") +
          "\n\n👉 Candidature sur le site web de Benny's."
      );
    return interaction.reply({ embeds: [embed] });
  }
  if (cmd === "effectif") {
    if (!data.effectif.length)
      return interaction.reply({ content: "Effectif vide.", ephemeral: true });
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("👥 Effectif Benny's")
          .setColor(0xff6a00)
          .setDescription(data.effectif.map((m) => "• " + m).join("\n")),
      ],
    });
  }
  if (cmd === "stats") {
    const list = Object.values(data.candidatures);
    const acc = list.filter((c) => c.statut === "accepte").length;
    const ref = list.filter((c) => c.statut === "refuse").length;
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📊 Statistiques Benny's")
          .setColor(0xff6a00)
          .addFields(
            { name: "Candidatures", value: String(list.length), inline: true },
            { name: "✅ Acceptées", value: String(acc), inline: true },
            { name: "❌ Refusées", value: String(ref), inline: true },
            { name: "⏳ En attente", value: String(list.length - acc - ref), inline: true },
            { name: "👥 Effectif", value: String(data.effectif.length), inline: true },
            { name: "🟢 Garage", value: data.ouvert ? "Ouvert" : "Fermé", inline: true }
          ),
      ],
    });
  }
  if (cmd === "partenaires") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🤝 Partenaires")
          .setColor(0xff6a00)
          .setDescription(data.partenaires.map((p) => "**" + p[0] + "** — " + p[1]).join("\n")),
      ],
    });
  }
  if (cmd === "tarifs") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("💰 Tarifs Benny's")
          .setColor(0xff6a00)
          .addFields(...data.tarifs.map((t) => ({ name: t[0], value: t[1], inline: true }))),
      ],
    });
  }
  if (cmd === "joueur") {
    const m = interaction.options.getUser("membre");
    await interaction.reply("🔧 " + m + " est **en service** chez Benny's.");
    return log("🔧 " + m.tag + " en service");
  }
  if (cmd === "clear") {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({
        content: "❌ Tu n'as pas la permission d'utiliser cette commande.",
        ephemeral: true,
      });
    }
    const nombre = interaction.options.getInteger("nombre");
    try {
      await interaction.deferReply({ ephemeral: true });
      const supprimes = await interaction.channel.bulkDelete(nombre, true);
      await interaction.editReply("🧹 " + supprimes.size + " message(s) supprimé(s).");
      return log(
        "🧹 " + supprimes.size + " messages supprimés dans #" + interaction.channel.name + " par " + interaction.user.tag
      );
    } catch (e) {
      return interaction.editReply(
        "❌ Suppression impossible : " + e.message + "\n(Les messages de plus de 14 jours ne peuvent pas être supprimés en masse.)"
      );
    }
  }
});

// ============================================================
//  DASHBOARD WEB
// ============================================================
function pageHtml(titre, corps) {
  return (
    "<!DOCTYPE html><html lang='fr'><head><meta charset='UTF-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
    "<title>" + titre + "</title><style>" +
    "body{background:#0b0b0d;color:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0;line-height:1.6}" +
    ".wrap{max-width:1000px;margin:0 auto;padding:32px 20px 60px}" +
    "h1{color:#ff6a00;font-size:1.5rem;margin:0 0 4px}" +
    "h2{font-size:1.05rem;margin:0 0 14px;color:#fff}" +
    ".top{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:24px}" +
    ".muted{color:#8a8a90;font-size:.86rem;margin:0}" +
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:26px}" +
    ".stat{background:#1c1c1f;border:1px solid #2a2a2e;border-radius:12px;padding:18px;text-align:center}" +
    ".stat b{display:block;font-size:1.7rem;color:#ff6a00;font-weight:900}" +
    ".stat span{color:#8a8a90;font-size:.75rem;text-transform:uppercase;letter-spacing:1px}" +
    ".card{background:#1c1c1f;border:1px solid #2a2a2e;border-radius:12px;padding:20px;margin-bottom:16px}" +
    ".btn{display:inline-block;background:#ff6a00;color:#0b0b0d;border:none;border-radius:6px;padding:9px 16px;font-weight:700;cursor:pointer;font-size:.85rem;margin:0 6px 6px 0;text-decoration:none}" +
    ".btn.sec{background:transparent;border:1px solid #555;color:#bbb}" +
    ".btn.refuse{background:#c0392b;color:#fff}" +
    ".btn.ok{background:#2ecc71;color:#0b0b0d}" +
    ".badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700}" +
    ".b-attente{background:rgba(255,170,0,.15);color:#ffaa00}" +
    ".b-accepte{background:rgba(46,204,113,.15);color:#2ecc71}" +
    ".b-refuse{background:rgba(192,57,43,.15);color:#e74c3c}" +
    "input,select{width:100%;padding:10px;border-radius:7px;border:1px solid #2a2a2e;background:#0b0b0d;color:#fff;box-sizing:border-box;margin-bottom:10px;font-family:inherit}" +
    ".row{display:flex;gap:16px;flex-wrap:wrap} .row>div{flex:1;min-width:260px}" +
    "</style></head><body><div class='wrap'>" + corps + "</div></body></html>"
  );
}

function renderDashboard() {
  const data = loadData();
  const liste = Object.entries(data.candidatures).reverse();
  const acc = liste.filter((c) => c[1].statut === "accepte").length;
  const ref = liste.filter((c) => c[1].statut === "refuse").length;
  const att = liste.length - acc - ref;

  let html =
    "<div class='top'><div><h1>🔧 Tableau de bord — Benny's</h1>" +
    "<p class='muted'>Bot : " + botTag + " • " + (botReady ? "connecté ✅" : "hors ligne ⚠️") + "</p></div>" +
    "<div><a class='btn sec' href='/staff'>Rafraîchir</a><a class='btn sec' href='/staff/logout'>Déconnexion</a></div></div>" +

    "<div class='grid'>" +
    "<div class='stat'><b>" + liste.length + "</b><span>Candidatures</span></div>" +
    "<div class='stat'><b>" + att + "</b><span>En attente</span></div>" +
    "<div class='stat'><b>" + acc + "</b><span>Acceptées</span></div>" +
    "<div class='stat'><b>" + ref + "</b><span>Refusées</span></div>" +
    "<div class='stat'><b>" + data.effectif.length + "</b><span>Effectif</span></div>" +
    "<div class='stat'><b>" + (data.ouvert ? "OUVERT" : "FERMÉ") + "</b><span>Garage</span></div>" +
    "</div>" +

    "<div class='card'><h2>🚦 Contrôle du garage</h2>" +
    "<form method='POST' action='/staff/garage' style='display:inline'>" +
    "<input type='hidden' name='etat' value='ouvert'><button class='btn ok' type='submit'>🟢 Ouvrir le garage</button></form>" +
    "<form method='POST' action='/staff/garage' style='display:inline'>" +
    "<input type='hidden' name='etat' value='ferme'><button class='btn refuse' type='submit'>🔴 Fermer le garage</button></form>" +
    "</div>" +

    "<div class='card'><h2>➕ Ajouter une candidature à la main</h2>" +
    "<form method='POST' action='/staff/ajouter'>" +
    "<div class='row'><div><input type='text' name='nom_rp' placeholder='Nom / Prénom RP' required>" +
    "<input type='text' name='discord' placeholder='Pseudo Discord'>" +
    "<input type='text' name='age' placeholder='Âge RP'></div>" +
    "<div><select name='poste'>" +
    POSTES.map((p) => "<option value='" + p + "'>" + p + "</option>").join("") +
    "</select><input type='text' name='dispo' placeholder='Disponibilités'>" +
    "<input type='text' name='motivation' placeholder='Motivation'></div></div>" +
    "<button class='btn' type='submit'>Ajouter la candidature</button></form></div>";

  html += "<div class='card'><h2>📋 Candidatures</h2>";
  if (!liste.length) html += "<p class='muted'>Aucune candidature pour le moment.</p>";

  for (const item of liste) {
    const id = item[0];
    const c = item[1];
    const statut =
      c.statut === "accepte"
        ? "<span class='badge b-accepte'>Accepté</span>"
        : c.statut === "refuse"
        ? "<span class='badge b-refuse'>Refusé</span>"
        : "<span class='badge b-attente'>En attente</span>";

    html +=
      "<div style='border-bottom:1px solid #2a2a2e;padding:12px 0'>" +
      "<b>" + (c.nom_rp || "Sans nom") + "</b> — " + (c.poste || "?") + " " + statut +
      "<br><span class='muted'>Discord : " + (c.discord || "-") + " • Âge : " + (c.age || "-") + "</span>" +
      (c.motivation ? "<br><span class='muted'>" + c.motivation + "</span>" : "");

    html += "<div style='margin-top:8px'>";
    if (c.statut === "en_attente") {
      html +=
        "<form method='POST' action='/staff/decision' style='display:inline'>" +
        "<input type='hidden' name='id' value='" + id + "'>" +
        "<input type='hidden' name='decision' value='accepte'>" +
        "<button class='btn ok' type='submit'>✅ Accepter</button></form>" +
        "<form method='POST' action='/staff/decision' style='display:inline'>" +
        "<input type='hidden' name='id' value='" + id + "'>" +
        "<input type='hidden' name='decision' value='refuse'>" +
        "<button class='btn refuse' type='submit'>❌ Refuser</button></form>";
    }
    html +=
      "<form method='POST' action='/staff/supprimer' style='display:inline'>" +
      "<input type='hidden' name='id' value='" + id + "'>" +
      "<button class='btn sec' type='submit'>🗑 Supprimer</button></form></div></div>";
  }
  html += "</div>";

  html += "<div class='card'><h2>👥 Effectif</h2>";
  if (!data.effectif.length) html += "<p class='muted'>Aucun membre enregistré.</p>";
  data.effectif.forEach((m, i) => {
    html +=
      "<div style='border-bottom:1px solid #2a2a2e;padding:8px 0;display:flex;justify-content:space-between;align-items:center'>" +
      "<span>" + m + "</span>" +
      "<form method='POST' action='/staff/retirer'>" +
      "<input type='hidden' name='index' value='" + i + "'>" +
      "<button class='btn sec' type='submit'>Retirer</button></form></div>";
  });
  html += "</div>";

  html += "<div class='card'><h2>💰 Tarifs</h2>";
  data.tarifs.forEach((t, i) => {
    html +=
      "<form method='POST' action='/staff/tarif' style='display:flex;gap:8px;margin-bottom:8px'>" +
      "<input type='hidden' name='index' value='" + i + "'>" +
      "<input type='text' name='nom' value='" + t[0] + "'>" +
      "<input type='text' name='prix' value='" + t[1] + "' style='max-width:130px'>" +
      "<button class='btn' type='submit'>OK</button></form>";
  });
  html +=
    "<form method='POST' action='/staff/tarif' style='display:flex;gap:8px;margin-top:12px'>" +
    "<input type='hidden' name='index' value='new'>" +
    "<input type='text' name='nom' placeholder='Nouvelle prestation'>" +
    "<input type='text' name='prix' placeholder='Prix' style='max-width:130px'>" +
    "<button class='btn' type='submit'>Ajouter</button></form></div>";

  html += "<div class='card'><h2>🤝 Partenaires</h2>";
  data.partenaires.forEach((p, i) => {
    html +=
      "<form method='POST' action='/staff/partenaire' style='display:flex;gap:8px;margin-bottom:8px'>" +
      "<input type='hidden' name='index' value='" + i + "'>" +
      "<input type='text' name='nom' value='" + p[0] + "'>" +
      "<input type='text' name='desc' value='" + p[1] + "'>" +
      "<button class='btn' type='submit'>OK</button></form>";
  });
  html +=
    "<form method='POST' action='/staff/partenaire' style='display:flex;gap:8px;margin-top:12px'>" +
    "<input type='hidden' name='index' value='new'>" +
    "<input type='text' name='nom' placeholder='Nouveau partenaire'>" +
    "<input type='text' name='desc' placeholder='Description'>" +
    "<button class='btn' type='submit'>Ajouter</button></form></div>";

  return pageHtml("Dashboard Benny's", html);
}

function renderLoginPage(erreur) {
  return pageHtml(
    "Connexion Staff",
    "<h1>🔧 Espace Staff Benny's</h1>" +
      "<p class='muted'>Accès réservé à la direction.</p>" +
      (erreur ? "<div class='card' style='border-color:#c0392b'>" + erreur + "</div>" : "") +
      "<div class='card'><form method='POST' action='/staff'>" +
      "<input type='password' name='mdp' placeholder='Mot de passe' required>" +
      "<button class='btn' type='submit'>Se connecter</button></form></div>"
  );
}

function parseBody(req, cb) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => cb(body));
}

function isLogged(req) {
  return (req.headers.cookie || "").includes("bennys_staff=ok");
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  // --- Candidatures du site ---
  if (req.method === "POST" && url === "/candidature-webhook") {
    return parseBody(req, async (body) => {
      let p;
      try {
        p = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "json invalide" }));
      }

      try {
        const nomRp = p.rpName || "-";
        const disc = p.discordTag || "-";
        const poste = p.poste || "Apprenti Mécanicien";
        const id = "w" + Date.now();

        const data = loadData();
        data.candidatures[id] = {
          nom_rp: nomRp,
          discord: disc,
          age: p.rpAge || "-",
          poste: poste,
          dispo: p.dispo || "-",
          experience: p.experience || "-",
          motivation: p.motivation || "-",
          statut: "en_attente",
        };
        saveData(data);

        if (SALON_CANDIDATURES_ID && SALON_CANDIDATURES_ID !== "0") {
          try {
            const salon = await client.channels.fetch(SALON_CANDIDATURES_ID);
            if (salon && salon.isTextBased()) {
              const embed = new EmbedBuilder()
                .setTitle("🔧 Nouvelle candidature Benny's")
                .setColor(0xff6a00)
                .addFields(
                  { name: "Nom RP", value: nomRp, inline: true },
                  { name: "Discord", value: disc, inline: true },
                  { name: "Âge RP", value: String(p.rpAge || "-"), inline: true },
                  { name: "Poste", value: poste, inline: true },
                  { name: "Disponibilités", value: p.dispo || "-", inline: false },
                  { name: "Expérience", value: p.experience || "-", inline: false },
                  { name: "Motivation", value: p.motivation || "-", inline: false }
                )
                .setFooter({ text: "Tableau de bord : /staff" });
              await salon.send({ embeds: [embed] });
            }
          } catch (e) {
            console.error("Post salon impossible :", e.message);
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
    });
  }

  // --- Connexion ---
  if (req.method === "POST" && url === "/staff") {
    return parseBody(req, (body) => {
      const mdp = new URLSearchParams(body).get("mdp") || "";
      if (mdp === STAFF_PASSWORD) {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": "bennys_staff=ok; Path=/; HttpOnly; SameSite=Lax",
        });
        return res.end(renderDashboard());
      }
      res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(renderLoginPage("Mot de passe incorrect."));
    });
  }

  const actions = [
    "/staff/ajouter",
    "/staff/decision",
    "/staff/supprimer",
    "/staff/retirer",
    "/staff/tarif",
    "/staff/partenaire",
    "/staff/garage",
  ];

  if (req.method === "POST" && actions.indexOf(url) !== -1) {
    if (!isLogged(req)) {
      res.writeHead(302, { Location: "/staff" });
      return res.end();
    }
    return parseBody(req, async (body) => {
      const params = new URLSearchParams(body);
      const data = loadData();

      if (url === "/staff/ajouter") {
        const nomRp = params.get("nom_rp") || "-";
        const poste = params.get("poste") || "Apprenti Mécanicien";
        data.candidatures["m" + Date.now()] = {
          nom_rp: nomRp,
          discord: params.get("discord") || "-",
          age: params.get("age") || "-",
          poste: poste,
          dispo: params.get("dispo") || "-",
          experience: "-",
          motivation: params.get("motivation") || "-",
          statut: "en_attente",
        };
        saveData(data);
        await log("➕ Candidature ajoutée à la main : " + nomRp + " — " + poste);
      }

      if (url === "/staff/decision") {
        const c = data.candidatures[params.get("id")];
        const decision = params.get("decision");
        if (c) {
          c.statut = decision === "accepte" ? "accepte" : "refuse";
          if (decision === "accepte") {
            const entry = (c.nom_rp || "candidat") + " — " + (c.poste || "poste");
            if (data.effectif.indexOf(entry) === -1) data.effectif.push(entry);
          }
          saveData(data);
          await log(
            (decision === "accepte" ? "✅ " : "❌ ") +
              "Candidature de " + (c.nom_rp || "candidat") +
              (decision === "accepte" ? " acceptée" : " refusée") + " depuis le dashboard"
          );
        }
      }

      if (url === "/staff/supprimer") {
        delete data.candidatures[params.get("id")];
        saveData(data);
      }

      if (url === "/staff/retirer") {
        const i = parseInt(params.get("index"), 10);
        if (!isNaN(i)) {
          data.effectif.splice(i, 1);
          saveData(data);
        }
      }

      if (url === "/staff/tarif") {
        const i = params.get("index");
        const nom = params.get("nom") || "";
        const prix = params.get("prix") || "";
        if (i === "new") {
          if (nom) data.tarifs.push([nom, prix || "-"]);
        } else {
          const idx = parseInt(i, 10);
          if (!isNaN(idx) && data.tarifs[idx]) data.tarifs[idx] = [nom, prix];
        }
        saveData(data);
      }

      if (url === "/staff/partenaire") {
        const i = params.get("index");
        const nom = params.get("nom") || "";
        const desc = params.get("desc") || "";
        if (i === "new") {
          if (nom) data.partenaires.push([nom, desc || "Partenaire officiel"]);
        } else {
          const idx = parseInt(i, 10);
          if (!isNaN(idx) && data.partenaires[idx]) data.partenaires[idx] = [nom, desc];
        }
        saveData(data);
      }

      if (url === "/staff/garage") {
        data.ouvert = params.get("etat") === "ouvert";
        saveData(data);
        await log("🚦 Garage " + (data.ouvert ? "OUVERT" : "FERMÉ") + " depuis le dashboard");
      }

      res.writeHead(302, { Location: "/staff" });
      return res.end();
    });
  }

  if (url === "/staff/logout") {
    res.writeHead(302, {
      Location: "/staff",
      "Set-Cookie": "bennys_staff=; Path=/; Max-Age=0",
    });
    return res.end();
  }

  if (url === "/staff") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(isLogged(req) ? renderDashboard() : renderLoginPage());
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    pageHtml(
      "Bot Benny's",
      "<h1>🔧 Bot Benny's</h1>" +
        "<div class='card'><b>Bot Benny's en ligne ✅</b>" +
        "<p class='muted'>Tableau de bord : <a href='/staff' style='color:#ff6a00'>/staff</a></p></div>"
    )
  );
});

server.listen(PORT, () => console.log("🌐 Serveur webhook + dashboard sur le port " + PORT));

client.once("ready", async () => {
  botReady = true;
  botTag = client.user.tag;
  console.log("✅ Bot Benny's connecté en tant que " + client.user.tag);
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    if (GUILD_ID && GUILD_ID !== "0") {
      await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    }
    console.log("✅ Commandes slash enregistrées");
  } catch (err) {
    console.error("Erreur commandes :", err.message);
  }
  client.user.setActivity("Garage Benny's 🔧", { type: ActivityType.Watching });
});

client.login(TOKEN).catch((err) => {
  console.error("Erreur de connexion :", err.message || err);
  process.exit(1);
});
