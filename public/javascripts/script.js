var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-16645901-1']);
_gaq.push(['_trackPageview']);

(function() {
 var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
 ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
 var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();

var socket;

renderFile = function(file) {
 $('.template .file').clone()
  .find('.name').text(file.name).end()
  .appendTo('body');
}

$(function() {
 socket = io.connect();

 socket.on('user', function (data) {
  console.log(data);
 });

 socket.on('progress', function(data) {
  $('.progress').text(Math.round(100 * data));
 });

 socket.on('file', function(file) {
  console.log('got file');
  console.log(file);
  renderFile(file);
 });

 for(name in file)
  renderFile(file[name]);

 $.event.props.push('dataTransfer');
 $('#dropbox').bind('dragover', false);
 $('#dropbox').bind('drop', function(event) {
  for(var i = 0, f; f = event.dataTransfer.files[i]; i++) {
/*
   var fileReader = new FileReader();
   fileReader.onload = (function(file) {return function(event) {
   }})(f);
   fileReader.readAsBinaryString(f);
*/
   var formData = new FormData();
   formData.append(f.name, f);

   renderFile(f);

   $.ajax({
    'type': 'POST',
    'url': '/upload', 
    'contentType': false,
    'data': formData,
    'processData': false,
    'success': function(data) {
     console.log(data);
    }
   });

   _gaq.push(['_trackEvent', 'Upload', 'start', f.name]);

  }
  return false;
 });

 $('#upgrade').click(function() {
  $('#pay').fadeIn(100);
 });
});