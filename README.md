
# 🤖 Bot Benny's — Original Motor Works

Bot Discord pour le garage Benny's (GTA RP) : commandes d'ouverture, recrutement,
candidatures avec boutons Accepter / Refuser et message privé automatique au joueur.

## Configuration (variables d'environnement)

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Token du bot (portail développeur Discord → onglet Bot) |
| `GUILD_ID` | ID du serveur Discord |
| `SALON_CANDIDATURES_ID` | ID du salon où arrivent les candidatures |
| `SALON_LOGS_ID` | ID du salon des logs |
| `ROLE_RECRUTEUR_ID` | ID du rôle autorisé à accepter/refuser (0 = tout le monde) |

⚠️ Sur le portail développeur Discord, activez **SERVER MEMBERS INTENT**
(onglet Bot → Privileged Gateway Intents), sinon le bot refusera de démarrer.

## Commandes

`/ouvert` `/ferme` `/recrutement` `/effectif` `/stats` `/partenaires` `/tarifs`
`/joueur` `/candidature`

## Lancement

```
npm install
npm start
```
