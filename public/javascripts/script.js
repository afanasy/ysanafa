var _gaq = _gaq || [];

(function() {
 var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
 ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
 var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();

var socket;

renderFile = function(file) {
 return $('.template .file').clone()
  .find('a').attr('href', '/f/' + file._id).end()
  .find('.name').text(file.name).end()
  .bind('dragstart', function(event) {
   event.dataTransfer.setData('DownloadURL', file.type + ':' + file.name + ':' + 'http://' + document.domain + '/f/' + '4eabfcfd75520eb89843cb54');
  })
  .appendTo('body').get()[0];
}

$(function() {
 socket = io.connect();

 socket.on('user', function (data) {
  console.log(data);
 });

 socket.on('progress', function(data) {
  $('.progress').text(Math.round(100 * data));
 });

 socket.on('file', function(f) {
  console.log('got file');
  console.log(file[f.name]);
  $(file[f.name].element)
   .find('a').attr('href', f._id);
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
   name = f.name;
   if(file[name])
    name += ' (2)';

   var formData = new FormData();
   formData.append(name, f);

   file[name] = {
    'name': name
   }
   file[name].element = renderFile(file[name]);

   console.log(file[name]);

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

 $('.template .file').bind('dragstart', function(event) {
  console.log('dragstart');
//  console.log('set dataTransfer');
//  event.dataTransfer.setData('DownloadURL', 'image/png:ffff.png:http://ysanafa.com:8000/f/4eabfcfd75520eb89843cb54');
 });

 $('#upgrade').click(function() {
  $('#pay').fadeIn(100);
 });
});