document.querySelector('a[href="#comittee"]').addEventListener('click', async function(event) {
  event.preventDefault();
  try {
    const response = await fetch('/comittee');
    if (response.ok) {
      const comittee = await response.json();
      displayComittee(comittee);
    } else {
      console.error('Failed to fetch comittee');
    }
  } catch (error) {
    console.error('Error fetching comittee:', error);
  }
});

function displayComittee(comittee) {
  const container = document.querySelector('.align-left');
  container.innerHTML = `
    <h4>Committee List</h4>
    <div class="student-container">
      ${comittee.map(student => `
        <div class="student-card">
          <p><strong>Student Number:</strong> ${student.studentNumber}</p>
          <p><strong>Email:</strong> ${student.email}</p>
          <button class="button button-a button-rouded" onclick="resetPassword('${student._id}')">Reset Password</button>
        </div>
      `).join('')}
    </div>
  `;
}
