setTimeout(() => {
    const notifications = document.querySelectorAll('.notification');
    notifications.forEach(notification => {
      notification.style.display = 'none';
    });
  }, 5000);
  $(document).ready(function () {
$('#setDeadlineButton').click(function () {
  const deadline = $('#consent_deadline').val();

  if (deadline) {
    $.ajax({
      url: '/set-deadline',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ deadline }),
      success: function (response) {
        alert(response.message);
      },
      error: function (error) {
        alert('Error setting deadline');
      }
    });
  } else {
    alert('Please select a deadline date.');
  }
});
});