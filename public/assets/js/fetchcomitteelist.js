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
  container.innerHTML = '<h4>Comittee List</h4><ul>' + comittee.map(student => `
    <li>${student.studentNumber} - ${student.email} - ${student.accountType}</li>
  `).join('') + '</ul>';
}