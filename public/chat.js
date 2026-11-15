// Get elements
const chatLog = document.getElementById('chat-log');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('send-btn');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('join-btn');
const channelList = document.getElementById('channel-list');
const createChannelBtn = document.getElementById('create-channel-btn');
const channelNameInput = document.getElementById('channel-name');

// Set up WebSocket connection
const socket = new WebSocket('wss://example.com/chat');

// Handle join button click
joinBtn.addEventListener('click', () => {
  const username = usernameInput.value;
  socket.send(JSON.stringify({ type: 'join', username }));
});

// Handle create channel button click
createChannelBtn.addEventListener('click', () => {
  const channelName = channelNameInput.value;
  socket.send(JSON.stringify({ type: 'createChannel', channelName }));
});

// Handle send button click
sendBtn.addEventListener('click', () => {
  const message = messageInput.value;
  const channelId = getActiveChannelId();
  socket.send(JSON.stringify({ type: 'message', message, channelId }));
  messageInput.value = '';
});

// Handle incoming messages
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'message') {
    chatLog.innerHTML += `<p>${data.username}: ${data.message}</p>`;
  } else if (data.type === 'channelCreated') {
    const channelHtml = `<div id="channel-${data.channelId}">${data.channelName}</div>`;
    channelList.innerHTML += channelHtml;
  }
});

// Get active channel ID
function getActiveChannelId() {
  const activeChannel = document.querySelector('.active-channel');
  return activeChannel.dataset.channelId;
}
