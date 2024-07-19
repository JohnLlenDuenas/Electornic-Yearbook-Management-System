// Check if user is authenticated
function checkAuthenticated() {
  fetch('/check-auth')
    .then(response => response.json())
    .then(data => {
      if (!data.isAuthenticated) {
        window.location.href = '/login';
      } else {
        // User is authenticated, proceed with role-based access control
        ensureRole(data.userRole);
      }
    })
    .catch(error => {
      console.error('Error checking authentication:', error);
      window.location.href = '/login';
    });
}

// Ensure role-based access control
function ensureRole(role) {
  const path = window.location.pathname;
  if ((path.startsWith('/admin') && role !== 'admin') ||
      (path.startsWith('/student') && role !== 'student') ||
      (path.startsWith('/committee') && role !== 'committee') ||
      (path.startsWith('/consent') && role !== 'student')) { // Add this line
        window.history.back();
  }
}

// Execute check on page load
document.addEventListener('DOMContentLoaded', checkAuthenticated);