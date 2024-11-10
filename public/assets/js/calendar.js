const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

function renderCalendar() {
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const previousDays = new Date(currentYear, currentMonth, 0).getDate();

  // Clear existing calendar cells
  const dateCells = document.getElementById('dateCells');
  dateCells.innerHTML = '';

  // Set month and year title
  document.getElementById('monthYear').textContent = `${monthNames[currentMonth]} ${currentYear}`;

  // Add previous month's days in gray
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.textContent = previousDays - i;
    cell.style.color = '#ccc';
    dateCells.appendChild(cell);
  }

  // Add current month’s days with consent deadlines highlighted
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.textContent = day;

    // Check if this day is a consent deadline
    const deadline = consentDeadlines.find(d => {
      const consentDate = new Date(d.consentDeadline);
      return consentDate.getDate() === day && consentDate.getMonth() === currentMonth && consentDate.getFullYear() === currentYear;
    });

    if (deadline) {
      cell.style.backgroundColor = '#FFDDC1'; // Highlight deadline date
      cell.title = `Yearbook: ${deadline.title} Consent Deadline`;
    }

    dateCells.appendChild(cell);
  }

  // Add next month's days in gray if the calendar grid is incomplete
  const totalCells = firstDayOfMonth + daysInMonth;
  const remainingCells = 42 - totalCells;
  for (let i = 1; i <= remainingCells; i++) {
    const cell = document.createElement('div');
    cell.textContent = i;
    cell.style.color = '#ccc';
    dateCells.appendChild(cell);
  }
}

// Event listeners for navigating months
document.getElementById('prevMonth').onclick = () => {
  if (currentMonth === 0) {
    currentMonth = 11;
    currentYear--;
  } else {
    currentMonth--;
  }
  renderCalendar();
};

document.getElementById('nextMonth').onclick = () => {
  if (currentMonth === 11) {
    currentMonth = 0;
    currentYear++;
  } else {
    currentMonth++;
  }
  renderCalendar();
};

// Initial render
renderCalendar();

