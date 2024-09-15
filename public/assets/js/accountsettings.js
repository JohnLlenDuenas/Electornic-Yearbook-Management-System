
  
  function accountsettings() {
    const container = document.querySelector('.align-left');
    container.innerHTML = '<form id="changePasswordForm"> <div class="col-md-12 mb-3"> <div class="form-group"> <label for="current_password"><h4>Current Password</h4></label> <input type="password" class="form-control" id="current_password" placeholder="Enter Current Password" required> </div> </div> <div class="col-md-12 mb-3"> <div class="form-group"> <label for="new_password"><h4>New Password</h4></label> <input type="password" class="form-control" id="new_password" placeholder="Enter New Password" required> </div> </div> <div class="col-md-12 mb-3"> <div class="form-group"> <label for="confirm_password"><h4>Confirm New Password</h4></label> <input type="password" class="form-control" id="confirm_password" placeholder="Confirm New Password" required> </div> </div> <div class="col-md-12 mb-3"> <div> <button type="button" class="button button-a button-big button-rounded" id="changePasswordButton">Change Password</button> </div> </div> </form>';
  }

  document.querySelector('a[href="#accsettings"]').addEventListener('click', async function(event) {
    event.preventDefault();
    accountsettings();
  
    // Attach listener after injecting the form
    document.getElementById('changePasswordButton').addEventListener('click', changePassword);
  });
  
  async function changePassword() {
    const currentPassword = document.getElementById('current_password').value;
    const newPassword = document.getElementById('new_password').value;
    const confirmPassword = document.getElementById('confirm_password').value;
  
    if (newPassword !== confirmPassword) {
      alert('New passwords do not match!');
      return;
    }
  
    try {
      const response = await fetch('/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
  
      const data = await response.json();
      if (response.ok) {
        alert(data.message); // Success message from server
        window.location.href = '/login'; // Redirect to login after successful password change
      } else {
        alert(data.message); // Error message from server
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Something went wrong. Please try again later.');
    }
  }
  