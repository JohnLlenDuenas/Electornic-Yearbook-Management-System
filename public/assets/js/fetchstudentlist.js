document.querySelector('a[href="#students"]').addEventListener('click', async function(event) {
  event.preventDefault();
  try {
    const response = await fetch('/students');
    if (response.ok) {
      const students = await response.json();
      displayStudents(students);
    } else {
      console.error('Failed to fetch students');
    }
  } catch (error) {
    console.error('Error fetching students:', error);
  }
});

function displayStudents(students) {
  const container = document.querySelector('.align-left');
  container.innerHTML = `
    <h4>Student List</h4>
    <div class="student-container">
      ${students.map(student => `
        <div class="student-card">
          <p><strong>Student Number:</strong> ${student.studentNumber}</p>
          <p><strong>Email:</strong> ${student.email}</p>
          <button class="button button-a button-rouded" onclick="resetPassword('${student._id}')">Reset Password</button>
          ${student.consentfilled ? `<button class="button button-a button-rouded" onclick="viewConsent('${student.studentNumber}')">View Consent</button>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}



function viewConsent(studentNumber) {
  window.location.href = `/consents/${studentNumber}`;
}



async function resetPassword(studentId) {
  if (confirm('Are you sure you want to reset the password for this student?')) {
    try {
      const response = await fetch(`/reset-password/${studentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json(); // Parse the JSON response
      if (response.ok) {
        alert(data.message);
      } else {
        alert('Failed to reset password: ' + data.message);
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('An unexpected error occurred.');
    }
  }
}
