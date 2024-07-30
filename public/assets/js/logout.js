document.getElementById('logoutButton').addEventListener('click', function() {
    fetch('/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    .then(response => response.json())
    .then(data => {
      if (data.message === 'Logout successful') {
        window.location.href = '/login';
      } else {
        alert('Error logging out');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert('Error logging out');
    });
  });