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
      <li>${student.studentNumber} - ${student.email} - ${student.accountType}</li>
    `).join('') + '</ul>';
  }