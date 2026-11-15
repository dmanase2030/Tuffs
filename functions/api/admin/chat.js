// Handle message request
socket.on('message', (data) => {
  const message = data.message;
  const channelId = data.channelId;
  const username = data.username;
  // Save message to database
  db.messages.insert({ channelId, message, username });
  // Send message event to clients in the same channel
  socket.to(channelId).emit('message', { message, username });
});

// Handle create channel request
socket.on('createChannel', (data) => {
  const channelName = data.channelName;
  const channelId = generateChannelId();
  // Save channel to database
  db.channels.insert({ id: channelId, name: channelName });
  // Send channel created event to clients
  socket.emit('channelCreated', { channelId, channelName });
});

// Handle update profile request
socket.on('updateProfile', (data) => {
  const username = data.username;
  const profilePicture = data.profilePicture;
  const banner = data.banner;
  // Update user profile in database
  db.users.update({ id: userId }, { $set: { username, profilePicture, banner } });
  // Send profile updated event to client
  socket.emit('profileUpdated', { username, profilePicture, banner });
});
