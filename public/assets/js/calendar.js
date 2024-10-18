
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();

    const monthYearDisplay = document.getElementById('monthYear');
    const dateCells = document.getElementById('dateCells');
    const prevMonthButton = document.getElementById('prevMonth');
    const nextMonthButton = document.getElementById('nextMonth');

    // Function to render the calendar
    function renderCalendar() {
        dateCells.innerHTML = ''; // Clear previous dates
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
        const lastDateOfMonth = new Date(currentYear, currentMonth + 1, 0);
        const lastDayOfPreviousMonth = new Date(currentYear, currentMonth, 0);
        
        const firstDayOfWeek = firstDayOfMonth.getDay();
        const lastDate = lastDateOfMonth.getDate();
        const totalDays = firstDayOfWeek + lastDate;

        // Display month and year
        monthYearDisplay.textContent = `${monthNames[currentMonth]} ${currentYear}`;

        // Add previous month's overflow days
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const prevMonthDate = new Date(currentYear, currentMonth - 1, lastDayOfPreviousMonth.getDate() - i);
            const day = prevMonthDate.getDate();
            const div = document.createElement('div');
            div.textContent = day;
            div.style.color = '#ccc';
            dateCells.appendChild(div);
        }

        // Add the current month's dates
        for (let day = 1; day <= lastDate; day++) {
            const div = document.createElement('div');
            div.textContent = day;
            div.onclick = () => alert(`You clicked on ${day} ${monthNames[currentMonth]} ${currentYear}`);
            dateCells.appendChild(div);
        }

        // Add next month's overflow days (if needed)
        const remainingCells = 42 - totalDays;
        for (let i = 0; i < remainingCells; i++) {
            const nextMonthDate = new Date(currentYear, currentMonth + 1, i + 1);
            const div = document.createElement('div');
            div.textContent = nextMonthDate.getDate();
            div.style.color = '#ccc';
            dateCells.appendChild(div);
        }
    }

    // Event listeners for the buttons
    prevMonthButton.addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        renderCalendar();
    });

    nextMonthButton.addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        renderCalendar();
    });

    // Initial rendering of the calendar
    renderCalendar();
