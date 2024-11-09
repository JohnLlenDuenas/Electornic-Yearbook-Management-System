
document.getElementById('toggle-button').addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('retracted');
    document.getElementById('content').classList.toggle('retracted');
  });

  document.getElementById('undo-button').addEventListener('click', function() {
    
    alert('Undo button clicked');
  });

  document.getElementById('redo-button').addEventListener('click', function() {
    
    alert('Redo button clicked');
  });

  let zoomLevel = 100;

  function updateZoom() {
    const img = document.getElementById('yearbook-image');
    img.style.transform = `scale(${zoomLevel / 100})`;
    document.getElementById('zoom-percentage').textContent = `${zoomLevel}%`;
  }

  document.getElementById('zoom-in').addEventListener('click', function() {
    zoomLevel = Math.min(zoomLevel + 10, 200);
    updateZoom();
  });

  document.getElementById('zoom-out').addEventListener('click', function() {
    zoomLevel = Math.max(zoomLevel - 10, 50);
    updateZoom();
  });

  document.getElementById('zoom-button').addEventListener('click', function() {
    const img = document.getElementById('yearbook-image');
    img.style.transform = img.style.transform === 'scale(1.5)' ? 'scale(1)' : 'scale(1.5)';
    img.style.transition = 'transform 0.3s ease';
  });

  updateZoom();
