$(document).ready(function () {
  $('#createAccountButton').click(function () {
    const formData = new FormData();
    formData.append('studentNumber', $('#student_number').val());
    formData.append('email', $('#email').val());
    formData.append('birthday', $('#birthday').val()); // Capture birthday as the password
    formData.append('accountType', $('#acctype').val());
    formData.append('consentfilled', false);

    // Add the picture file
    const pictureFile = $('#picture')[0].files[0];
    if (pictureFile) {
      formData.append('picture', pictureFile);
    }

    // Ensure all required fields are filled
    if ($('#student_number').val() && $('#email').val() && $('#birthday').val() && $('#acctype').val()) {
      $.ajax({
        url: '/create-account',
        type: 'POST',
        data: formData,
        processData: false, // Prevent jQuery from processing the data
        contentType: false, // Set contentType to false as we are using FormData
        success: function (response) {
          alert(response.message);
          $('#createAccForm')[0].reset(); // Clear the form fields
        },
        error: function (error) {
          alert('Error creating account');
          console.error('Error details:', error);
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
        skipEmptyLines: true,
        complete: function (results) {
          const data = results.data;
          const tbody = $('#csvPreviewTable tbody');
          tbody.empty();

          // Display each row with missing fields indicated
          data.forEach(row => {
            const tr = $('<tr>');
            tr.append($('<td>').text(row.studentNumber || 'Missing'));
            tr.append($('<td>').text(row.email || 'Missing'));
            tr.append($('<td>').text(row.birthday || 'Missing'));
            tr.append($('<td>').text(row.accountType || 'Missing'));
            tbody.append(tr);
          });

          $('#csvPreviewTable').show();
        },
        error: function (error) {
          alert("Error parsing CSV file. Please check the file format.");
        }
      });
    } else {
      $('#csvPreviewTable').hide();
      alert("Please select a CSV file.");
    }
  });

  $('#uploadCsvButton').click(function () {
    const csvFile = $('#csvFile')[0].files[0];
    const pictureFiles = $('#pictures')[0].files;
  
    if (!csvFile) {
      return alert('Please select a CSV file.');
    }
  
    const formData = new FormData();
    formData.append('csvFile', csvFile);
  
    for (let i = 0; i < pictureFiles.length; i++) {
      formData.append('pictures', pictureFiles[i]);
    }
  
    $.ajax({
      url: '/upload-csv',
      type: 'POST',
      processData: false,
      contentType: false,
      data: formData,
      success: function (response) {
        alert(response.message);
        $('#createAccForm')[0].reset();
        $('#csvPreviewTable tbody').empty();
        $('#csvPreviewTable').hide();
      },
      error: function (xhr) {
        const errorMsg = xhr.responseJSON ? xhr.responseJSON.message : 'Error uploading CSV and pictures';
        alert(`Error: ${errorMsg}`);
      }
    });
  });
  
});
