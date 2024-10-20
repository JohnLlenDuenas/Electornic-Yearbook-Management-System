$(document).ready(function () {
  $('#createAccountButton').click(function () {
    const studentNumber = $('#student_number').val();
    const email = $('#email').val();
    const birthday = $('#birthday').val(); // Capture birthday as the password
    const accountType = $('#acctype').val();
    const conf = false;

    // Ensure all required fields are filled
    if (studentNumber && email && birthday && accountType) {
      $.ajax({
        url: '/create-account',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          studentNumber: studentNumber,
          email: email,
          birthday: birthday, // Send birthday as the password
          accountType: accountType,
          consentfilled: conf,
        }),
        success: function (response) {
          alert(response.message);
          $('#createAccForm')[0].reset(); // Clear the form fields
        },
        error: function (error) {
          alert('Error creating account');
        }
      });
    } else {
      alert('Please fill out all fields.');
    }
  });

  $('#csvFile').change(function (e) {
    const file = e.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        complete: function (results) {
          const data = results.data;
          const tbody = $('#csvPreviewTable tbody');
          tbody.empty();
          data.forEach(row => {
            const tr = $('<tr>');
            tr.append($('<td>').text(row.studentNumber));
            tr.append($('<td>').text(row.email));
            tr.append($('<td>').text(row.birthday)); // Use birthday as password if missing
            tr.append($('<td>').text(row.accountType));
            tbody.append(tr);
          });
          $('#csvPreviewTable').show();
        }
      });
    }
  });

  $('#uploadCsvButton').click(function () {
    const file = $('#csvFile')[0].files[0];
  
    if (file) {
      const formData = new FormData();
      formData.append('csvFile', file); // Send the file with the key 'csvFile'
  
      $.ajax({
        url: '/upload-csv',
        type: 'POST',
        processData: false, // Don't process the files
        contentType: false, // Set content type to false to let jQuery set it
        data: formData,
        success: function (response) {
          alert(response.message);
          $('#createAccForm')[0].reset(); // Clear the form fields
          $('#csvPreviewTable tbody').empty(); // Clear the table
          $('#csvPreviewTable').hide();
        },
        error: function (error) {
          alert('Error uploading CSV');
        }
      });
    } else {
      alert('Please select a CSV file');
    }
  });
});
