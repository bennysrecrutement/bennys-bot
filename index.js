// ============================================================
//  BOT DISCORD BENNY'S ORIGINAL MOTOR WORKS (discord.js v14)
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

// --- 1) CONFIGURATION (variables d'environnement) -----------
const TOKEN = process.env.DISCORD_TOKEN || "COLLE_TON_TOKEN_ICI";
const GUILD_ID = process.env.GUILD_ID || "0";
const SALON_CANDIDATURES_ID = process.env.SALON_CANDIDATURES_ID || "0";
const SALON_LOGS_ID = process.env.SALON_LOGS_ID || "0";
const ROLE_RECRUTEUR_ID = process.env.ROLE_RECRUTEUR_ID || "0";
const PORT = process.env.PORT || 8080;
// ------------------------------------------------------------

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
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

const TARIFS = [
  ["Réparation", "1000$"],
  ["Dépannage Sud", "1000$"],
  ["Dépannage Nord", "1400$"],
  ["Kit de réparation / nettoyage", "500$"],
];

const PARTENAIRES = [
  ["Burger Shot", "Partenaire officiel de Benny's"],
  ["BCSO", "Partenaire officiel de Benny's"],
];

const POSTES = [
  "Apprenti Mécanicien",
  "Mécanicien",
  "Mécanicien Confirmé",
  "Chef d'Équipe",
  "Directeur Référent",
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
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_${candidatId}`)
      .setLabel("✅ Accepter")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`refuse_${candidatId}`)
      .setLabel("❌ Refuser")
      .setStyle(ButtonStyle.Danger)
  );
  return row;
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

  let membre = null;
  try {
    membre = await interaction.guild.members.fetch(candidatId);
  } catch {}

  const data = loadData();
  const candidature = data.candidatures[candidatId];
  const nomRp = (candidature && candidature.nom_rp) || "candidat";
  const poste = (candidature && candidature.poste) || "Apprenti Mécanicien";

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("done_accept")
      .setLabel(action === "accept" ? "✅ Accepté" : "✅ Accepter")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("done_refuse")
      .setLabel(action === "refuse" ? "❌ Refusé" : "❌ Refuser")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );

  let mpOk = false;

  if (action === "accept") {
    if (membre) {
      const entry = `${membre.user.tag} (${nomRp}) — ${poste}`;
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
          "Un membre de la direction va te contacter très vite pour la suite. " +
          "Bienvenue dans la famille ! 🔧"
      );
    }

    await interaction.update({ components: [disabledRow] });
    await interaction.followup({
      content:
        `✅ Candidature de **${nomRp}** acceptée.` +
        (mpOk ? "" : " ⚠️ MP impossible (le joueur a ses MP fermés)."),
      ephemeral: true,
    });
    await log(`✅ Candidature de ${nomRp} acceptée par ${interaction.user.tag}`);
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
          "Tu pourras retenter ta chance plus tard. Merci de ton intérêt ! 🔧"
      );
    }

    await interaction.update({ components: [disabledRow] });
    await interaction.followup({
      content:
        `❌ Candidature de **${nomRp}** refusée.` +
        (mpOk ? "" : " ⚠️ MP impossible (le joueur a ses MP fermés)."),
      ephemeral: true,
    });
    await log(`❌ Candidature de ${nomRp} refusée par ${interaction.user.tag}`);
  }
});

const commands = [
  new SlashCommandBuilder().setName("ouvert").setDescription("Ouvrir le garage Benny's"),
  new SlashCommandBuilder().setName("ferme").setDescription("Fermer le garage Benny's"),
  new SlashCommandBuilder()
    .setName("recrutement")
    .setDescription("Afficher le panel de recrutement"),
  new SlashCommandBuilder().setName("effectif").setDescription("Voir l'effectif du garage"),
  new SlashCommandBuilder().setName("stats").setDescription("Statistiques du garage"),
  new SlashCommandBuilder().setName("partenaires").setDescription("Liste des partenaires"),
  new SlashCommandBuilder().setName("tarifs").setDescription("Tarifs du garage Benny's"),
  new SlashCommandBuilder()
    .setName("joueur")
    .setDescription("Marquer un joueur en service")
    .addUserOption((o) =>
      o.setName("membre").setDescription("Le joueur qui prend son service").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("candidature")
    .setDescription("Créer un panel de candidature (recruteurs)")
    .addUserOption((o) =>
      o.setName("membre").setDescription("Le joueur qui postule").setRequired(true)
    )
    .addStringOption((o) => o.setName("nom_rp").setDescription("Nom / Prénom RP").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("poste")
        .setDescription("Poste visé")
        .addChoices(...POSTES.map((p) => ({ name: p, value: p })))
    ),
].map((c) => c.toJSON());

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const commandName = interaction.commandName;
  const data = loadData();

  if (commandName === "ouvert") {
    data.ouvert = true;
    saveData(data);
    await interaction.reply("🟢 Le garage **Benny's** est maintenant **OUVERT**.");
    return log(`🟢 Garage ouvert par ${interaction.user.tag}`);
  }

  if (commandName === "ferme") {
    data.ouvert = false;
    saveData(data);
    await interaction.reply("🔴 Le garage **Benny's** est maintenant **FERMÉ**.");
    return log(`🔴 Garage fermé par ${interaction.user.tag}`);
  }

  if (commandName === "recrutement") {
    const embed = new EmbedBuilder()
      .setTitle("🔧 Recrutement Benny's Original Motor Works")
      .setColor(0xff6a00)
      .setDescription(
        "Le garage recrute ! Postes ouverts :\n" +
          POSTES.map((p) => "• " + p).join("\n") +
          "\n\n👉 Dépose ta candidature sur le site web de Benny's."
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === "effectif") {
    if (!data.effectif.length) {
      return interaction.reply({ content: "Aucun membre enregistré.", ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setTitle("👥 Effectif Benny's")
      .setColor(0xff6a00)
      .setDescription(data.effectif.map((m) => "• " + m).join("\n"));
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === "stats") {
    const list = Object.values(data.candidatures);
    const accepte = list.filter((c) => c.statut === "accepte").length;
    const refuse = list.filter((c) => c.statut === "refuse").length;
    const attente = list.length - accepte - refuse;
    const embed = new EmbedBuilder()
      .setTitle("📊 Statistiques Benny's")
      .setColor(0xff6a00)
      .addFields(
        { name: "Candidatures", value: String(list.length), inline: true },
        { name: "✅ Acceptées", value: String(accepte), inline: true },
        { name: "❌ Refusées", value: String(refuse), inline: true },
        { name: "⏳ En attente", value: String(attente), inline: true },
        { name: "👥 Effectif", value: String(data.effectif.length), inline: true },
        { name: "🟢 Garage", value: data.ouvert ? "Ouvert" : "Fermé", inline: true }
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === "partenaires") {
    const embed = new EmbedBuilder()
      .setTitle("🤝 Partenaires de Benny's")
      .setColor(0xff6a00)
      .setDescription(PARTENAIRES.map((item) => `**${item[0]}** — ${item[1]}`).join("\n"));
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === "tarifs") {
    const embed = new EmbedBuilder()
      .setTitle("💰 Tarifs Benny's")
      .setColor(0xff6a00)
      .addFields(...TARIFS.map((item) => ({ name: item[0], value: item[1], inline: true })));
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === "joueur") {
    const membre = interaction.options.getUser("membre");
    await interaction.reply(`🔧 ${membre} est maintenant **en service** chez Benny's.`);
    return log(`🔧 ${membre.tag} en service (déclaré par ${interaction.user.tag})`);
  }

  if (commandName === "candidature") {
    const membre = interaction.options.getUser("membre");
    const nomRp = interaction.options.getString("nom_rp");
    const poste = interaction.options.getString("poste") || "Apprenti Mécanicien";

    data.candidatures[membre.id] = { nom_rp: nomRp, poste: poste, statut: "en_attente" };
    saveData(data);

    const embed = new EmbedBuilder()
      .setTitle("🔧 Nouvelle candidature Benny's")
      .setColor(0xff6a00)
      .addFields(
        { name: "Candidat", value: `${membre}`, inline: true },
        { name: "Nom RP", value: nomRp, inline: true },
        { name: "Poste", value: poste, inline: true },
        { name: "Statut", value: "⏳ En attente", inline: false }
      );

    return interaction.reply({
      embeds: [embed],
      components: [candidatureButtons(membre.id)],
    });
  }
});

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/candidature-webhook") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "json invalide" }));
      }

      try {
        const salon = await client.channels.fetch(SALON_CANDIDATURES_ID);
        if (!salon || !salon.isTextBased()) throw new Error("salon introuvable");

        const nomRp = payload.rpName || "-";
        const discordTag = payload.discordTag || "-";
        const poste = payload.poste || "Apprenti Mécanicien";

        let membre = null;
        try {
          const guild = await client.guilds.fetch(GUILD_ID);
          const membres = await guild.members.fetch();
          const pseudo = String(discordTag).replace("@", "").split("#")[0].toLowerCase();
          membre = membres.find(
            (m) =>
              m.user.username.toLowerCase() === pseudo ||
              m.displayName.toLowerCase() === pseudo
          );
        } catch {}

        const embed = new EmbedBuilder()
          .setTitle("🔧 Nouvelle candidature Benny's")
          .setColor(0xff6a00)
          .addFields(
            { name: "Nom RP", value: nomRp, inline: true },
            { name: "Discord", value: discordTag, inline: true },
            { name: "Âge RP", value: String(payload.rpAge || "-"), inline: true },
            { name: "Poste", value: poste, inline: true },
            { name: "Disponibilités", value: payload.dispo || "-", inline: false },
            { name: "Expérience", value: payload.experience || "-", inline: false },
            { name: "Motivation", value: payload.motivation || "-", inline: false }
          );

        if (membre) {
          const data = loadData();
          data.candidatures[membre.id] = { nom_rp: nomRp, poste: poste, statut: "en_attente" };
          saveData(data);
          await salon.send({
            embeds: [embed],
            components: [candidatureButtons(membre.id)],
          });
        } else {
          embed.setFooter({
            text: "⚠️ Joueur non trouvé sur le serveur — MP impossible",
          });
          await salon.send({ embeds: [embed] });
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot Benny's en ligne ✅");
});

server.listen(PORT, () => console.log("🌐 Serveur webhook démarré sur le port " + PORT));

client.once("clientReady", async () => {
  console.log(`✅ Bot Benny's connecté en tant que ${client.user.tag}`);

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
    console.error("Erreur enregistrement des commandes :", err);
  }

  client.user.setActivity("Garage Benny's 🔧", { type: ActivityType.Watching });
});

client.login(TOKEN);
