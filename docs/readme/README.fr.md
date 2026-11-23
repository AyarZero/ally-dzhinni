**Languages:** [Русский](../../README.md) · [English](./README.en.md) · [简体中文](./README.zh-CN.md) · [Українська](./README.uk.md) · [Tiếng Việt](./README.vi.md) · [हिन्दी](./README.hi.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md) · **Français** · [עברית](./README.he.md) · [العربية](./README.ar.md) · [Español](./README.es.md) · [Português (BR)](./README.pt-BR.md) · [한국어](./README.ko.md) · [Türkçe](./README.tr.md) · [Bahasa Indonesia](./README.id.md)

> 📖 **Application guide interactive (16 langues, mise en page PDF et historique):** `AllY-Guide.exe` · [../index.html?lang=fr](../index.html?lang=fr)

# AllY · Джинни (v0.1)

Application de bureau locale pour Windows réunissant plusieurs IA dans une seule fenêtre, avec un historique de conversation commun, une mémoire locale sur disque, une file de tâches et un suivi des limites.

*Date de naissance d’AllY · Джинни : le 23 novembre 2026. Licence : MIT.*

---

## Présentation de l’application et du problème qu’elle résout

Quand on travaille régulièrement avec l’IA, les tâches se dispersent vite entre les onglets du navigateur, les fenêtres de terminal et les différentes clés. Lorsqu’un modèle atteint sa limite de cinq heures, il faut en ouvrir un autre et lui réexpliquer le contexte du projet.

**AllY · Джинни** répond à quatre besoins pratiques :

- **Un contexte commun entre les modèles.** L’historique de conversation et votre base de règles sont stockés localement dans des fichiers Markdown (`pamyat/`). Vous pouvez changer d’IA, de modèle ou de profondeur de raisonnement directement dans la zone de saisie pour que le modèle suivant reprenne la tâche au même endroit.
- **Une visibilité sur le travail des agents CLI.** Dans un terminal classique, il est difficile de repérer à temps l’étape en cours d’un agent et d’intervenir pendant son exécution. Dans AllY, la sphère d’état et le fil des actions en cours s’affichent à gauche, derrière un séparateur vertical fluide et redimensionnable. À droite se trouvent la conversation et la file de tâches, avec la possibilité de préciser les consignes à la volée (`live-steer`), de modifier la file et de donner la priorité à un message important.
- **Un suivi des limites et de la fenêtre de contexte.** Le widget **« Ressources »** affiche l’IA principale, le remplissage du contexte (avec un seuil de `350k`) et les quotas des abonnements sur 5 heures et sur une semaine. L’onglet **« Assistants »** regroupe les soldes des autres connexions. Les indicateurs sont relevés localement, sans appels payants en arrière-plan.
- **La maîtrise des données et des connexions directes.** Les conversations, les notes `pamyat/`, les compétences `.claude/skills/` et les paramètres locaux `.ally-data/` restent sur votre ordinateur. Vous utilisez vos propres abonnements et clés directement auprès des fournisseurs choisis.

---

## À qui s’adresse l’application

- **Aux développeurs et aux adeptes du vibe coding** qui gèrent leurs projets avec Claude Code, Codex, Antigravity ou DeepSeek et souhaitent voir les étapes des agents, la file de tâches et l’utilisation du contexte dans une seule fenêtre qu’ils maîtrisent.
- **Aux auteurs, entrepreneurs et professionnels** qui ont besoin d’une mémoire locale commune pour leurs projets sur leur propre PC.
- **Aux utilisateurs de Windows 10/11** qui cherchent un outil local dont ils peuvent adapter l’agencement à leurs tâches et influencer les prochaines versions grâce aux retours intégrés.

---

## Ce qui fonctionne réellement dans la version 0.1

### 1. Connexions et mode « Auto »
Pour commencer, il suffit de configurer au moins une connexion. En mode **« Auto »**, le système choisit lui-même un agent disponible :

| Connexion | Mode de fonctionnement | Capacités dans v0.1 |
|---|---|---|
| **Claude Code** | CLI officiel avec un abonnement Anthropic Pro / Max | Tâches complexes, code, textes, planification et compression automatique du contexte |
| **Codex** | CLI officiel avec un abonnement ChatGPT Plus / Pro | Travail sur les dépôts et précisions pendant la génération de la réponse (`live-steer`) |
| **Antigravity** | CLI officiel Google AI | Analyses avec un contexte étendu (seuil de fenêtre de `350k`) et suivi des quotas |
| **DeepSeek Harness** | Profil local sans interface `dsh`, utilisant le solde DeepSeek | Agent de secours économique, consultation du solde dans l’onglet « Assistants » |
| **Agrégateur d’API (OpenRouter)** | Toute passerelle compatible avec Anthropic, via une URL de base et une clé | Connexion de modèles externes via un processus local Claude Code CLI (sans abonnement Anthropic) |
| **Qoder CLI** | CLI local (détection et connexion au compte) | Détecté par l’assistant de connexion (avec connexion au compte depuis la fenêtre) ; son utilisation comme agent principal dans la conversation arrivera dans la prochaine mise à jour |

### 2. Espace de travail et interface
- **Écran d’accueil :** à gauche s’ouvre **« Conversation »** avec une sphère d’état épurée, le fil d’étapes et un séparateur fluide ; à droite se trouvent **« Ressources » / « Assistants »** (en haut) et **« Ordinateur »** (en bas), redimensionnables librement.
- **Barre supérieure (de droite à gauche) :** horloge à droite, large panneau **retour d’expérience (insecte)**, **pinceau** (déplacement et redimensionnement des widgets, réinitialisation), **thèmes** (**Graphite** par défaut, plus Turquoise, Minuit, Sombre et Clair), **icône de livre** (guide et historique intégrés dans l’application) et **éclair** (assistant en 3 étapes avec **« Mode lecture »** pleine largeur).
- **Stockage local :** `pamyat/` (mémoire Markdown locale), `.claude/skills/` (compétences locales), `.ally-data/` (clés et agencement de la fenêtre, exclu de Git).

## Installation et lancement (Windows 10/11)

**Avant l’installation, assurez-vous que les éléments suivants sont déjà installés et accessibles dans le `PATH` :**
1. **Node.js 24+** (avec prise en charge du module intégré `node:sqlite`)
2. **Python 3**
3. **Git**
4. Une connexion Internet pendant la première compilation (`npm ci` et téléchargement d’Electron), ainsi qu’au moins un moteur d’IA connecté ou une clé.

Choisissez l’une de ces trois méthodes d’installation :

### Méthode 1 — avec une archive et un `.exe` classique
1. Téléchargez l’archive ZIP du dépôt et extrayez-la dans un chemin court sans caractères cyrilliques, par exemple `C:\AllY`.
2. Double-cliquez sur **`AllY.exe`** : au premier lancement, il vérifiera `node` 24+, `python` et `git`, installera les dépendances, téléchargera Electron, compilera **`programma\Dzhinni.exe`**, créera le raccourci **`AllY`** sur le bureau et ouvrira la fenêtre.
  *Si Windows SmartScreen affiche un avertissement pour un `.exe` non signé, cliquez sur **Informations complémentaires → Exécuter quand même** (le code source des lanceurs est ouvert dans `docs/launchers/`, ou lancez directement `.\ustanovka.ps1`).*
3. Par la suite, lancez l’application en double-cliquant sur **`AllY.exe`**, sur le raccourci **`AllY`** du bureau ou directement sur **`programma\Dzhinni.exe`**. Pour ouvrir la documentation et l’historique des versions dans une fenêtre dédiée, lancez **`AllY-Guide.exe`**.
4. Au premier lancement, l’assistant de démarrage en 3 étapes s’ouvre : connectez l’IA souhaitée et envoyez votre premier message.

### Méthode 2 — avec des commandes dans le terminal (PowerShell / cmd)
Ouvrez PowerShell et exécutez les commandes suivantes dans l’ordre :

```powershell
git clone https://github.com/AyarZero/ally-dzhinni.git C:\AllY
cd C:\AllY
.\AllY.exe
```

Vous pourrez vérifier ultérieurement que la compilation est prête avec la commande :

```powershell
.\AllY.exe -Proverka
```

Lancement depuis le terminal :

```powershell
.\AllY.exe
```

### Méthode 3 — un prompt prêt à l’emploi pour votre IA locale
Si Claude Code, Codex, Antigravity ou un autre assistant IA fonctionne déjà sur votre ordinateur, copiez ce texte en entier et envoyez-le-lui :

```text
Installe et prépare au lancement l’application de bureau locale AllY · Джинни (v0.1) sur ce PC Windows à partir du dépôt https://github.com/AyarZero/ally-dzhinni :
1. Vérifie dans le terminal la présence de `git`, de `python` (Python 3) et de `node` (il faut Node.js 24+ et la commande `node -e "require('node:sqlite')"` doit fonctionner). Si un élément manque ou si la version de Node est inférieure à 24, préviens-moi et aide-moi à l’installer avant la compilation.
2. Clone le dépôt dans un chemin court sans caractères cyrilliques ni espaces, par exemple `C:\AllY`, puis place-toi dans ce dossier.
3. Lance l’installation : `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1` et attends la compilation de `programma\Dzhinni.exe`.
4. Vérifie la compilation avec la commande `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1 -Proverka`.
5. Vérifie quels moteurs CLI (Claude Code, Codex, Antigravity, DeepSeek Harness, Qoder) ou quelles clés OpenRouter sont déjà disponibles dans le système, et indique-moi brièvement ce qui est prêt.
6. Lance `programma\Dzhinni.exe` (ou `.\AllY.exe`) et indique-moi que je peux ouvrir la fenêtre AllY et commencer à travailler.
```

*Remarque : les agents CLI connectés travaillent directement sur les fichiers du dossier de travail ouvert, sans demander d’autorisation à chaque lecture ou modification. Gardez vos projets importants sous Git.*

---

## Retours et participation au développement du projet

Dans la partie droite de l’en-tête (à gauche de l’horloge), le bouton avec une **icône d’insecte — « Retours »** permet, directement depuis l’interface, de :

- signaler une erreur, un dysfonctionnement de l’interface ou un problème de démarrage ;
- joindre au message jusqu’à **3 fichiers** justificatifs : journaux texte `.txt` / `.md` (jusqu’à `2 Mo`), captures d’écran `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` (jusqu’à `10 Mo`) ou courtes vidéos `.mp4` / `.webm` / `.mov` (jusqu’à `25 Mo`, avec un total maximal de `30 Mo`) ;
- proposer un nouveau module, une compétence ou un cas d’usage.

**Seuls le texte du formulaire et les fichiers que vous avez sélectionnés** sont envoyés : les conversations, les notes personnelles et les clés restent en local. Les réponses des développeurs arrivent dans la conversation de l’application. Le projet est ouvert sous licence MIT : vous pouvez créer vos propres compétences dans `.claude/skills/` et contribuer à l’amélioration du cœur de l’application.

---

## Problèmes connus et limitations de v0.1 sur lesquels nous travaillons

Nous indiquons clairement ce qui reste limité ou est en cours de finalisation :

1. **Les dépendances de l’environnement doivent être installées au préalable :** l’installation de `v0.1` nécessite que `Node.js 24+`, `Python 3` et `Git` soient déjà installés. Un installateur `.exe` autonome unique, sans préparation manuelle des logiciels, est encore en cours de développement.
2. **La saisie et la restitution vocales sont masquées dans la version cliente v0.1 :** les boutons de microphone et de voix ont été temporairement retirés pendant la finalisation de la reconnaissance vocale locale (`GigaAM`) et de son installateur.
3. **Le journal (« Conversation franche ») est masqué dans la version client v0.1 :** la prise en charge multi-moteurs est en cours de finalisation pour une prochaine mise à jour.
4. **Arrêt différé du pont en arrière-plan après la fermeture de la fenêtre :** à la fermeture de la fenêtre, le serveur local du pont peut attendre le délai d’inactivité avant de s’arrêter (jusqu’à ~9 minutes) si une autre instance est rouverte immédiatement.
5. **L’intégration de Qoder est en cours :** l’assistant de connexion détecte le CLI local Qoder et l’état de connexion au compte, mais l’utilisation de Qoder comme agent principal dans la conversation reste désactivée jusqu’à la prochaine version.
6. **Déploiement côté serveur de la réception des pièces jointes volumineuses dans les retours :** si le serveur de retours renvoie une erreur de taille ou refuse un fichier lors de l’envoi d’une capture d’écran ou d’une vidéo avant la fin de la mise à jour du backend, vous pouvez immédiatement envoyer le formulaire en texte seul, sans perdre le brouillon.
7. **Plateforme :** testé et compilé uniquement pour **Windows 10/11**.

---

## Feuille de route et calendrier prévisionnel

Les dates sont indicatives : les prochaines versions sont planifiées à l’échelle de la semaine, les plus lointaines sur des périodes plus larges. Elles peuvent évoluer en fonction des retours réels des utilisateurs :

| Période indicative | Fonctionnalités prévues |
|---|---|
| **Fin novembre — début décembre 2026** *(1 à 2 semaines)* | Corrections issues des premiers retours depuis l’interface, prise en charge complète côté serveur des photos et vidéos jointes aux retours, arrêt immédiat du pont en arrière-plan à la fermeture de la fenêtre |
| **Seconde moitié de décembre 2026** | Outil de suivi intégré **« Tâches et projets »** (priorité du jour, tableau, calendrier, fiches) et fonctionnement de l’onglet **« Journal »** avec n’importe quel moteur choisi |
| **Janvier 2027** | Retour du **mode vocal local** (dictée hors ligne sans cloud + lecture des réponses) et installateur simplifié sans installation manuelle de `Node.js` et de `Git` |
| **Février — mars 2027** | Section **« Formation »** (bibliothèque de leçons dans l’application et cours d’introduction gratuit à AllY et à la préparation des versions), éditeur de widgets personnalisés et modules de révision/contenu |
| **Avril — mai 2027** | **Graphe de connaissances** interactif de l’espace de travail, panneau **« Santé du projet »** (couverture des liens et nœuds obsolètes) et prise en charge complète de Qoder comme assistant de lecture de code |
| **Juin — juillet 2027** | Version bêta du **client Android**, connecté au PC personnel par un canal sécurisé sans seconde base de données + adaptation de l’application de bureau à macOS et Linux |
| **Août 2027 et au-delà** | Version stable `v1.0`, catalogue de compétences partagées par la communauté et synchronisation de l’espace de travail entre plusieurs appareils de l’utilisateur |
