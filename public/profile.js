// Get elements
const profileForm = document.getElementById('profile-form');
const usernameInput = document.getElementById('username');
const profilePictureInput = document.getElementById('profile-picture');
const bannerInput = document.getElementById('banner');
const saveProfileBtn = document.getElementById('save-profile-btn');
const profilePreview = document.getElementById('profile-preview');
const profilePicturePreview = document.getElementById('profile-picture-preview');
const bannerPreview = document.getElementById('banner-preview');
const usernamePreview = document.getElementById('username-preview');

// Handle profile picture change
profilePictureInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    profilePicturePreview.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// Handle banner change
bannerInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    bannerPreview.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// Handle save profile button click
saveProfileBtn.addEventListener('click', (event) => {
  event.preventDefault();
  const username = usernameInput.value;
  const profilePicture = profilePictureInput.files[0];
  const banner = bannerInput.files[0];
  // Send profile update request to server
  socket.emit('updateProfile', { username, profilePicture, banner });
});

// Handle profile update response from server
socket.on('profileUpdated', (data) => {
  usernamePreview.textContent = data.username;
  profilePicturePreview.src = data.profilePicture;
  bannerPreview.src = data.banner;
});
