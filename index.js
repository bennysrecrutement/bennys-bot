// ============================================================
//  BOT DISCORD BENNY'S — espace staff web + /clear
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

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } catch {}
  }
  return { ouvert: false, effectif: [], candidatures: {} };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Sauvegarde impossible :", e.message);
  }
}

const TARIFS = [
  ["Réparation", "1000$"],
  ["Dépannage Nord", "1400$"],
  ["Dépannage Sud", "1000$"],
  ["Kit réparation/nettoyage", "500$"],
];

const PARTENAIRES = [
  ["Burger Shot", "Partenaire officiel"],
  ["BCSO", "Partenaire officiel"],
];

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
      "Candidature de " +
      res.nomRp +
      (action === "accept" ? " acceptée" : " refusée") +
      " par " +
      interaction.user.tag
  );
});

// --- Commandes slash ----------------------------------------
const commands = [
  new SlashCommandBuilder().setName("ouvert").setDescription("Ouvrir le garage"),
  new SlashCommandBuilder().setName("ferme").setDescription("Fermer le garage"),
  new SlashCommandBuilder().setName("recrutement").setDescription("Panel de recrutement"),
  new SlashCommandBuilder().setName("effectif").setDescription("Voir l'effectif"),
  new SlashCommandBuilder().setName("stats").setDescription("Statistiques du garage"),
  new SlashCommandBuilder().setName("partenaires").setDescription("Liste des partenaires"),
  new SlashCommandBuilder().setName("tarifs").setDescription("Tarifs du garage"),
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
          .setDescription(PARTENAIRES.map((p) => "**" + p[0] + "** — " + p[1]).join("\n")),
      ],
    });
  }
  if (cmd === "tarifs") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("💰 Tarifs Benny's")
          .setColor(0xff6a00)
          .addFields(...TARIFS.map((t) => ({ name: t[0], value: t[1], inline: true }))),
      ],
    });
  }
  if (cmd === "joueur") {
    const m = interaction.options.getUser("membre");
    await interaction.reply("🔧 " + m + " est **en service** chez Benny's.");
    return log("🔧 " + m.tag + " en service");
  }
  if (cmd === "clear") {
    if (ROLE_RECRUTEUR_ID && ROLE_RECRUTEUR_ID !== "0") {
      const roles = interaction.member ? interaction.member.roles.cache : null;
      if (!roles || !roles.has(ROLE_RECRUTEUR_ID)) {
        return interaction.reply({
          content: "❌ Tu n'as pas la permission d'utiliser cette commande.",
          ephemeral: true,
        });
      }
    }

    const nombre = interaction.options.getInteger("nombre");
    try {
      await interaction.deferReply({ ephemeral: true });
      const supprimes = await interaction.channel.bulkDelete(nombre, true);
      await interaction.editReply("🧹 " + supprimes.size + " message(s) supprimé(s).");
      return log(
        "🧹 " +
          supprimes.size +
          " messages supprimés dans #" +
          interaction.channel.name +
          " par " +
          interaction.user.tag
      );
    } catch (e) {
      return interaction.editReply(
        "❌ Suppression impossible : " +
          e.message +
          "\n(Les messages de plus de 14 jours ne peuvent pas être supprimés en masse.)"
      );
    }
  }
});

// ============================================================
//  PAGES WEB : accueil + espace staff
// ============================================================
function pageHtml(titre, corps) {
  return (
    "<!DOCTYPE html><html lang='fr'><head><meta charset='UTF-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
    "<title>" +
    titre +
    "</title><style>" +
    "body{background:#0b0b0d;color:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0;line-height:1.6}" +
    ".wrap{max-width:900px;margin:0 auto;padding:40px 20px}" +
    "h1{color:#ff6a00;font-size:1.6rem}" +
    ".card{background:#1c1c1f;border:1px solid #2a2a2e;border-radius:12px;padding:22px;margin-bottom:16px}" +
    ".card h3{margin:0 0 8px;font-size:1.1rem}" +
    ".muted{color:#8a8a90;font-size:.88rem}" +
    ".btn{display:inline-block;background:#ff6a00;color:#0b0b0d;border:none;border-radius:6px;padding:10px 18px;font-weight:700;cursor:pointer;font-size:.9rem;margin-right:8px;text-decoration:none}" +
    ".btn.refuse{background:#c0392b;color:#fff}" +
    ".badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:700}" +
    ".b-attente{background:rgba(255,170,0,.15);color:#ffaa00}" +
    ".b-accepte{background:rgba(46,204,113,.15);color:#2ecc71}" +
    ".b-refuse{background:rgba(192,57,43,.15);color:#e74c3c}" +
    "input,select{width:100%;padding:11px;border-radius:7px;border:1px solid #2a2a2e;background:#0b0b0d;color:#fff;box-sizing:border-box;margin-bottom:12px}" +
    "</style></head><body><div class='wrap'>" +
    corps +
    "</div></body></html>"
  );
}

function renderStaffPage(erreur) {
  const data = loadData();
  const liste = Object.entries(data.candidatures).reverse();

  let html =
    "<h1>🔧 Espace Staff — Benny's</h1>" +
    "<p class='muted'>" +
    liste.length +
    " candidature(s) • Effectif : " +
    data.effectif.length +
    " • Garage : " +
    (data.ouvert ? "ouvert" : "fermé") +
    "</p>" +
    "<div class='card'><h3>➕ Ajouter une candidature à la main</h3>" +
    "<form method='POST' action='/staff/ajouter'>" +
    "<input type='text' name='nom_rp' placeholder='Nom / Prénom RP' required>" +
    "<input type='text' name='discord' placeholder='Pseudo Discord'>" +
    "<input type='text' name='age' placeholder='Âge RP'>" +
    "<select name='poste'>" +
    POSTES.map((p) => "<option value='" + p + "'>" + p + "</option>").join("") +
    "</select>" +
    "<input type='text' name='dispo' placeholder='Disponibilités'>" +
    "<input type='text' name='motivation' placeholder='Motivation'>" +
    "<button class='btn' type='submit'>Ajouter la candidature</button>" +
    "</form></div>";

  if (erreur) html += "<div class='card' style='border-color:#c0392b'><b>" + erreur + "</b></div>";

  if (!liste.length) {
    html += "<div class='card'><p class='muted'>Aucune candidature pour le moment.</p></div>";
  }

  for (const [id, c] of liste) {
    const statut =
      c.statut === "accepte"
        ? "<span class='badge b-accepte'>Accepté</span>"
        : c.statut === "refuse"
        ? "<span class='badge b-refuse'>Refusé</span>"
        : "<span class='badge b-attente'>En attente</span>";

    html +=
      "<div class='card'><h3>" +
      (c.nom_rp || "Sans nom") +
      " — " +
      (c.poste || "Poste inconnu") +
      " " +
      statut +
      "</h3>" +
      "<p class='muted'>Discord : " +
      (c.discord || "-") +
      " • Âge RP : " +
      (c.age || "-") +
      "</p>" +
      "<p>" +
      (c.motivation || "") +
      "</p>";

    if (c.statut === "en_attente") {
      html +=
        "<form method='POST' action='/staff/decision' style='display:inline'>" +
        "<input type='hidden' name='id' value='" +
        id +
        "'>" +
        "<input type='hidden' name='decision' value='accepte'>" +
        "<button class='btn' type='submit'>✅ Accepter</button></form>" +
        "<form method='POST' action='/staff/decision' style='display:inline'>" +
        "<input type='hidden' name='id' value='" +
        id +
        "'>" +
        "<input type='hidden' name='decision' value='refuse'>" +
        "<button class='btn refuse' type='submit'>❌ Refuser</button></form>";
    }

    html += "</div>";
  }

  return pageHtml("Espace Staff Benny's", html);
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

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

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
                .setFooter({ text: "Traiter aussi depuis le site : /staff" });
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

  if (req.method === "POST" && url === "/staff") {
    return parseBody(req, (body) => {
      const params = new URLSearchParams(body);
      const mdp = params.get("mdp") || "";
      if (mdp === STAFF_PASSWORD) {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": "bennys_staff=ok; Path=/; HttpOnly; SameSite=Lax",
        });
        return res.end(renderStaffPage());
      }
      res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(renderLoginPage("Mot de passe incorrect."));
    });
  }

  if (req.method === "POST" && url === "/staff/ajouter") {
    return parseBody(req, async (body) => {
      const params = new URLSearchParams(body);
      const nomRp = params.get("nom_rp") || "-";
      const poste = params.get("poste") || "Apprenti Mécanicien";
      const id = "m" + Date.now();

      const data = loadData();
      data.candidatures[id] = {
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

      res.writeHead(302, { Location: "/staff" });
      return res.end();
    });
  }

  if (req.method === "POST" && url === "/staff/decision") {
    return parseBody(req, async (body) => {
      const params = new URLSearchParams(body);
      const id = params.get("id");
      const decision = params.get("decision");

      const data = loadData();
      const c = data.candidatures[id];
      if (c) {
        c.statut = decision === "accepte" ? "accepte" : "refuse";
        if (decision === "accepte") {
          const entry = (c.nom_rp || "candidat") + " — " + (c.poste || "poste");
          if (!data.effectif.includes(entry)) data.effectif.push(entry);
        }
        saveData(data);
        await log(
          (decision === "accepte" ? "✅ " : "❌ ") +
            "Candidature de " +
            (c.nom_rp || "candidat") +
            (decision === "accepte" ? " acceptée" : " refusée") +
            " depuis l'espace staff"
        );
      }

      res.writeHead(302, { Location: "/staff" });
      return res.end();
    });
  }

  if (url === "/staff") {
    const cookie = req.headers.cookie || "";
    if (!cookie.includes("bennys_staff=ok")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(renderLoginPage());
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(renderStaffPage());
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    pageHtml(
      "Bot Benny's",
      "<h1>🔧 Bot Benny's</h1>" +
        "<div class='card'><b>Bot Benny's en ligne ✅</b>" +
        "<p class='muted'>Espace staff : <a href='/staff' style='color:#ff6a00'>/staff</a></p></div>"
    )
  );
});

server.listen(PORT, () => console.log("🌐 Serveur webhook + espace staff sur le port " + PORT));

client.once("ready", async () => {
  console.log("✅ Bot Benny's connecté en tant que " + client.user.tag);
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    if (GUILD_ID && GUILD_ID !== "0") {
      await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
        body: commands,
      });
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
