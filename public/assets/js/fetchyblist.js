document.querySelector('a[href="#yearbooks"]').addEventListener('click', async function(event) {
    event.preventDefault();
    try {
      const response = await fetch('/yearbooks');
      if (response.ok) {
        const yearbooks = await response.json();
        displayYearbooks(yearbooks);
      } else {
        console.error('Failed to fetch yearbooks');
      }
    } catch (error) {
      console.error('Error fetching yearbooks:', error);
    }
  });
  
  function displayYearbooks(yearbooks) {
    const container = document.querySelector('.align-left');
    container.innerHTML = yearbooks.map(yearbook => `
      <a href="/yearbook/${yearbook.id}">
        <img src="${yearbook.thumbnail}" alt="${yearbook.title}" width="26%" height="200">
      </a>
    `).join('');
  }
  