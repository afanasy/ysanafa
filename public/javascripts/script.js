(function(d, s, id) {
 var js, fjs = d.getElementsByTagName(s)[0];
 if (d.getElementById(id)) {return;}
 js = d.createElement(s); js.id = id;
 js.src = "//connect.facebook.net/en_US/all.js";
 fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));

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
   event.dataTransfer.setData('DownloadURL', file.type + ':' + file.name + ':' + 'http://' + window.location.host + '/f/' + file._id);
  })
  .appendTo('#dropbox').get()[0];
}

$(function() {
 socket = io.connect();

 socket.on('user', function (user) {
  $('#user')
   .find('.name').text(user.name).end()
   .find('.icon').attr('src',  'https://graph.facebook.com/' + user.facebook.id + '/picture').end();
  console.log(user);
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

 window.fbAsyncInit = function() {
  FB.init({
   appId: facebook.appId,
   status: true,
   cookie: true,
   oauth: true,
   xfbml: true
  });
  FB.getLoginStatus(function(response) {
   if (response.authResponse) {
    console.log('loggedin');
    console.log(response);
    socket.emit('authResponse', response.authResponse);
    $('.login').fadeOut(500, function() {
     $('.logout').fadeIn(500);
    });
   } else {
    console.log('not logged in');
   }
  });
  FB.Event.subscribe('auth.login', function(response) {
   console.log('auth.login');
   socket.emit('authResponse', response.authResponse);
  });
 }

 $('#user .login').bind('click', function() {
  FB.login();
 });
});