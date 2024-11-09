const shareBtn = document.getElementById('btnshare');
const shareModal = document.getElementById('share-modal');
const closeShareModalBtn = document.getElementById('close-share-modal');

shareBtn.addEventListener('click', () => {
    shareModal.style.display = 'flex';
});

closeShareModalBtn.addEventListener('click', () => {
    shareModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === shareModal) {
        shareModal.style.display = 'none';
    }
});