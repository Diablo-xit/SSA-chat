// serveur.js - Facebook Chat Simplifie (Version Termux Stable)

const express = require('express');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
const server = require('http').createServer(app);

// === Fichiers de donnees ===
const USERS_FILE = './users.json';
const MESSAGES_FILE = './messages.json';

// Creer les fichiers s'ils n'existent pas
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, '{}');
}
if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, '[]');
}

// === Fonctions utilitaires ===
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// === Middleware ===
app.use(express.json());

// === Routes ===
app.get('/', function (req, res) {
  res.send(generateIndexHTML());
});

app.get('/chat.html', function (req, res) {
  const email = req.query.email;
  if (!email) {
    return res.redirect('/');
  }
  const users = readJSON(USERS_FILE);
  const user = users[email];
  if (!user) {
    return res.redirect('/');
  }
  res.set('Content-Type', 'text/html');
  res.send(generateChatHTML(user.name));
});

app.post('/register', function (req, res) {
  const { name, email, password, avatar } = req.body;
  const users = readJSON(USERS_FILE);

  if (users[email]) {
    return res.json({ success: false, message: 'Cet email est deja utilise.' });
  }

  users[email] = { name: name, email: email, password: password, avatar: avatar, isOnline: false };
  writeJSON(USERS_FILE, users);

  res.json({ success: true, message: 'Inscription reussie !' });
});

app.post('/login', function (req, res) {
  const { email, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users[email];

  if (!user) {
    return res.json({ success: false, message: 'Utilisateur non trouve.' });
  }
  if (user.password !== password) {
    return res.json({ success: false, message: 'Mot de passe incorrect.' });
  }

  res.json({ success: true, message: 'Connexion reussie.', name: user.name });
});

app.post('/forgot-password', function (req, res) {
  const { email } = req.body;
  const users = readJSON(USERS_FILE);
  if (users[email]) {
    console.log("[Recuperation] Lien envoye a " + email + " (simule)");
  }
  res.json({ message: "Si votre email existe, un lien de recuperation a ete envoye." });
});

// === WebSocket pour le chat en temps reel ===
const wss = new WebSocket.Server({ server });

const onlineUsers = new Map(); // email -> { name, avatar }

wss.on('connection', function (ws) {
  console.log("Client connecte");

  // Envoyer la liste des utilisateurs
  broadcastUserList();

  ws.on('message', function (data) {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'join') {
        const users = readJSON(USERS_FILE);
        const user = users[msg.email];
        if (user) {
          user.isOnline = true;
          users[msg.email] = user;
          writeJSON(USERS_FILE, users);
          onlineUsers.set(msg.email, { name: user.name, avatar: user.avatar });
          broadcastUserList();
        }
      }

      if (msg.type === 'message') {
        const payload = { type: 'message', user: msg.user, message: msg.message };
        wss.clients.forEach(function (client) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
          }
        });
      }

      if (msg.type === 'leave') {
        onlineUsers.delete(msg.email);
        broadcastUserList();
      }
    } catch (e) {
      console.error("Erreur:", e);
    }
  });

  ws.on('close', function () {
    // Deconnexion
    broadcastUserList();
  });
});

function broadcastUserList() {
  const userList = Array.from(onlineUsers.values());
  const payload = { type: 'users', users: userList };

  wss.clients.forEach(function (client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
}

// === HTML: Page d'accueil (inscription / connexion) ===
function generateIndexHTML() {
  return "<!DOCTYPE html>" +
    "<html lang='fr'>" +
    "<head>" +
    "  <meta charset='UTF-8'>" +
    "  <meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
    "  <title>Chat Simplifie</title>" +
    "  <style>" +
    "    body { font-family: 'Segoe UI', sans-serif; margin:0; padding:0; background:#f0f2f5; display:flex; justify-content:center; align-items:center; min-height:100vh; }" +
    "    .auth-container { width:400px; padding:30px; background:white; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.1); text-align:center; }" +
    "    input { width:100%; padding:12px; margin:8px 0; border:1px solid #ddd; border-radius:6px; box-sizing:border-box; }" +
    "    button { background:#1877f2; color:white; border:none; padding:12px; width:100%; border-radius:6px; font-size:16px; cursor:pointer; }" +
    "    button:hover { background:#166fe5; }" +
    "    a { color:#1877f2; text-decoration:none; }" +
    "    .form-link { margin:10px 0; }" +
    "    .hidden { display:none; }" +
    "  </style>" +
    "</head>" +
    "<body>" +
    "  <div class='auth-container'>" +
    "    <h1>Chat Simplifie</h1>" +
    "    <div id='registerForm'>" +
    "      <h2>Inscription</h2>" +
    "      <input type='text' id='regName' placeholder='Nom' required>" +
    "      <input type='email' id='regEmail' placeholder='Email' required>" +
    "      <input type='password' id='regPassword' placeholder='Mot de passe' required>" +
    "      <label>Avatar :</label>" +
    "      <select id='regAvatar'>" +
    "        <option value='🐵'>Singe</option>" +
    "        <option value='🐶'>Chien</option>" +
    "        <option value='🐱'>Chat</option>" +
    "        <option value='🦊'>Renard</option>" +
    "        <option value='🦁'>Lion</option>" +
    "      </select>" +
    "      <button onclick='register()'>S'inscrire</button>" +
    "      <p class='form-link'><a href='#' onclick='showLoginForm()'>Deja un compte ? Se connecter</a></p>" +
    "    </div>" +
    "    <div id='loginForm' class='hidden'>" +
    "      <h2>Connexion</h2>" +
    "      <input type='email' id='loginEmail' placeholder='Email' required>" +
    "      <input type='password' id='loginPassword' placeholder='Mot de passe' required>" +
    "      <button onclick='login()'>Se connecter</button>" +
    "      <p class='form-link'><a href='#' onclick='showForgotForm()'>Mot de passe oublie ?</a></p>" +
    "      <p class='form-link'><a href='#' onclick='showRegisterForm()'>Pas encore inscrit ?</a></p>" +
    "    </div>" +
    "    <div id='forgotForm' class='hidden'>" +
    "      <h2>Recuperer mot de passe</h2>" +
    "      <input type='email' id='forgotEmail' placeholder='Votre email' required>" +
    "      <button onclick='forgotPassword()'>Envoyer</button>" +
    "      <p class='form-link'><a href='#' onclick='showLoginForm()'>Retour</a></p>" +
    "    </div>" +
    "  </div>" +

    "  <script>" +
    "    function showRegisterForm() {" +
    "      document.getElementById('registerForm').classList.remove('hidden');" +
    "      document.getElementById('loginForm').classList.add('hidden');" +
    "      document.getElementById('forgotForm').classList.add('hidden');" +
    "    }" +
    "    function showLoginForm() {" +
    "      document.getElementById('registerForm').classList.add('hidden');" +
    "      document.getElementById('loginForm').classList.remove('hidden');" +
    "      document.getElementById('forgotForm').classList.add('hidden');" +
    "    }" +
    "    function showForgotForm() {" +
    "      document.getElementById('registerForm').classList.add('hidden');" +
    "      document.getElementById('loginForm').classList.add('hidden');" +
    "      document.getElementById('forgotForm').classList.remove('hidden');" +
    "    }" +

    "    async function register() {" +
    "      const name = document.getElementById('regName').value;" +
    "      const email = document.getElementById('regEmail').value;" +
    "      const password = document.getElementById('regPassword').value;" +
    "      const avatar = document.getElementById('regAvatar').value;" +

    "      const res = await fetch('/register', {" +
    "        method: 'POST'," +
    "        headers: { 'Content-Type': 'application/json' }," +
    "        body: JSON.stringify({ name, email, password, avatar })" +
    "      });" +
    "      const data = await res.json();" +
    "      alert(data.message);" +
    "      if (data.success) showLoginForm();" +
    "    }" +

    "    async function login() {" +
    "      const email = document.getElementById('loginEmail').value;" +
    "      const password = document.getElementById('loginPassword').value;" +

    "      const res = await fetch('/login', {" +
    "        method: 'POST'," +
    "        headers: { 'Content-Type': 'application/json' }," +
    "        body: JSON.stringify({ email, password })" +
    "      });" +
    "      const data = await res.json();" +
    "      if (data.success) {" +
    "        localStorage.setItem('userEmail', email);" +
    "        localStorage.setItem('username', data.name);" +
    "        window.location.href = '/chat.html?email=' + encodeURIComponent(email);" +
    "      } else {" +
    "        alert(data.message);" +
    "      }" +
    "    }" +

    "    async function forgotPassword() {" +
    "      const email = document.getElementById('forgotEmail').value;" +
    "      const res = await fetch('/forgot-password', {" +
    "        method: 'POST'," +
    "        headers: { 'Content-Type': 'application/json' }," +
    "        body: JSON.stringify({ email })" +
    "      });" +
    "      const data = await res.json();" +
    "      alert(data.message);" +
    "    }" +
    "  </script>" +
    "</body>" +
    "</html>";
}

// === HTML: Page de chat mise à jour ===
function generateChatHTML(username) {
  return "<!DOCTYPE html>" +
    "<html lang='fr'>" +
    "<head>" +
    "  <meta charset='UTF-8'>" +
    "  <title>Chat - Chat Simplifie</title>" +
    "  <style>" +
    "    body { font-family: sans-serif; margin:0; background:#f0f2f5; }" +
    "    header { background:#1877f2; color:white; padding:15px; display:flex; justify-content:space-between; align-items:center; }" +
    "    #logoutBtn { background:#e42217; border:none; color:white; padding:8px 15px; border-radius:6px; cursor:pointer; }" +
    "    .main-content { display:flex; gap:20px; padding:20px; }" +
    "    .users { width:250px; background:#f0f2f5; padding:15px; border-radius:8px; }" +
    "    #usersList { list-style:none; padding:0; }" +
    "    #usersList li { padding:8px; display:flex; align-items:center; gap:8px; border-bottom:1px solid #ddd; }" +
    "    .avatar { font-size:20px; }" +
    "    .status { width:10px; height:10px; border-radius:50%; display:inline-block; background:green; }" +
    "    .chat-area { flex:1; border:1px solid #ddd; border-radius:8px; display:flex; flex-direction:column; }" +
    "    .messages { flex:1; padding:15px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; position:relative; }" +
    "    #statusMessage { position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:80%; text-align:center; color:#888; font-style:italic; }" +
    "    .message { max-width:70%; padding:10px 15px; border-radius:18px; margin-bottom:5px; }" +
    "    .sent { background:#0084ff; color:white; align-self:flex-end; }" +
    "    .received { background:#e4e6eb; color:#1c1e21; align-self:flex-start; }" +
    "    .input-area { display:flex; padding:10px; background:#f0f2f5; }" +
    "    .input-area input { flex:1; padding:10px; border:1px solid #ddd; border-radius:20px; margin-right:10px; outline:none; }" +
    "    .input-area button { padding:10px 20px; background:#1877f2; color:white; border:none; border-radius:20px; }" +
    "  </style>" +
    "</head>" +
    "<body>" +
    "  <div class='chat-container'>" +
    "    <header>" +
    "      <h1>Chat</h1>" +
    "      <p>Bienvenue, <strong>" + username + "</strong> !</p>" +
    "      <button id='logoutBtn' onclick='logout()'>Deconnexion</button>" +
    "    </header>" +
    "    <div class='main-content'>" +
    "      <aside class='users'>" +
    "        <h3>Utilisateurs en ligne</h3>" +
    "        <ul id='usersList'></ul>" +
    "      </aside>" +
    "      <section class='chat-area'>" +
    "        <div class='messages' id='messages'>" +
    "          <div id='statusMessage'>Aucun utilisateur en ligne</div>" +
    "        </div>" +
    "        <div class='input-area'>" +
    "          <input type='text' id='messageInput' placeholder='Ecrire un message...' />" +
    "          <button onclick='sendMessage()'>Envoyer</button>" +
    "        </div>" +
    "      </section>" +
    "    </div>" +
    "  </div>" +

    "  <script>" +
    "    const username = '" + username + "';" +
    "    const userEmail = localStorage.getItem('userEmail');" +
    "    const messagesDiv = document.getElementById('messages');" +
    "    const statusMessage = document.getElementById('statusMessage');" +
    "    const usersList = document.getElementById('usersList');" +
    "    const messageInput = document.getElementById('messageInput');" +

    "    function loadMessages() {" +
    "      const saved = JSON.parse(localStorage.getItem('chatMessages') || '[]');" +
    "      if (saved.length === 0) {" +
    "        statusMessage.style.display = 'block';" +
    "      } else {" +
    "        statusMessage.style.display = 'none';" +
    "        messagesDiv.innerHTML = '';" +
    "        messagesDiv.appendChild(statusMessage);" +
    "        saved.forEach(msg => {" +
    "          const div = document.createElement('div');" +
    "          div.className = msg.user === username ? 'message sent' : 'message received';" +
    "          div.innerHTML = '<strong>' + msg.user + '</strong>: ' + msg.message;" +
    "          messagesDiv.appendChild(div);" +
    "        });" +
    "        messagesDiv.scrollTop = messagesDiv.scrollHeight;" +
    "      }" +
    "    }" +
    "    loadMessages();" +

    "    const ws = new WebSocket('ws://' + window.location.host);" +
    "    ws.onopen = () => {" +
    "      ws.send(JSON.stringify({ type: 'join', email: userEmail, user: username }));" +
    "    };" +

    "    ws.onmessage = (event) => {" +
    "      const data = JSON.parse(event.data);" +

    "      if (data.type === 'users') {" +
    "        usersList.innerHTML = '';" +
    "        if (data.users.length === 0) {" +
    "          const li = document.createElement('li');" +
    "          li.style.color = 'gray';" +
    "          li.textContent = 'Personne';" +
    "          usersList.appendChild(li);" +
    "          statusMessage.textContent = 'Aucun utilisateur en ligne';" +
    "          statusMessage.style.display = 'block';" +
    "        } else {" +
    "          data.users.forEach(u => {" +
    "            const li = document.createElement('li');" +
    "            li.innerHTML = '<span class=\"avatar\">' + u.avatar + '</span> ' + u.name + ' <span class=\"status\"></span>';" +
    "            usersList.appendChild(li);" +
    "          });" +
    "          statusMessage.style.display = 'none';" +
    "        }" +
    "      }" +

    "      if (data.type === 'message') {" +
    "        statusMessage.style.display = 'none';" +
    "        if (data.user !== username) {" +
    "          const div = document.createElement('div');" +
    "          div.className = 'message received';" +
    "          div.innerHTML = '<strong>' + data.user + '</strong>: ' + data.message;" +
    "          messagesDiv.appendChild(div);" +
    "          messagesDiv.scrollTop = messagesDiv.scrollHeight;" +

    "          const saved = JSON.parse(localStorage.getItem('chatMessages') || '[]');" +
    "          saved.push({ user: data.user, message: data.message, timestamp: Date.now() });" +
    "          localStorage.setItem('chatMessages', JSON.stringify(saved));" +
    "        }" +
    "      }" +
    "    };" +

    "    function sendMessage() {" +
    "      const text = messageInput.value.trim();" +
    "      if (!text) return;" +

    "      ws.send(JSON.stringify({ type: 'message', user: username, message: text }));" +

    "      const saved = JSON.parse(localStorage.getItem('chatMessages') || '[]');" +
    "      saved.push({ user: username, message: text, timestamp: Date.now() });" +
    "      localStorage.setItem('chatMessages', JSON.stringify(saved));" +

    "      statusMessage.style.display = 'none';" +

    "      const div = document.createElement('div');" +
    "      div.className = 'message sent';" +
    "      div.innerHTML = '<strong>Vous</strong>: ' + text;" +
    "      messagesDiv.appendChild(div);" +
    "      messagesDiv.scrollTop = messagesDiv.scrollHeight;" +
    "      messageInput.value = '';" +
    "    }" +

    "    function logout() {" +
    "      ws.send(JSON.stringify({ type: 'leave', email: userEmail }));" +
    "      ws.close();" +
    "      localStorage.removeItem('userEmail');" +
    "      localStorage.removeItem('username');" +
    "      window.location.href = '/';" +
    "    }" +
    "  </script>" +
    "</body>" +
    "</html>";
}

// === Demarrage du serveur ===
const PORT = process.env.PORT || 10000;
server.listen(PORT, function () {
  console.log("Chat demarre sur http://localhost:" + PORT);
});hu
