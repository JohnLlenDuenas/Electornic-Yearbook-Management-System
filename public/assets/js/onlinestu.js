
const socket = io();
socket.on('updateOnlineUsers', (onlineUsers) => {
    document.getElementById('studentsOnline').innerText = onlineUsers.student;
    document.getElementById('committeeOnline').innerText = onlineUsers.committee;
    document.getElementById('adminOnline').innerText = onlineUsers.admin;
});