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
  container.innerHTML = '<h4>Student List</h4><ul>' + students.map(student => `
    <li>
      ${student.studentNumber} - ${student.email} - ${student.accountType}
      <button onclick="resetPassword('${student._id}')">Reset Password</button>
    </li>
  `).join('') + '</ul>';
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
      if (response.ok) {
        alert('Password reset successfully');
      } else {
        console.error('Failed to reset password');
        alert('Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
    }
  }
}
