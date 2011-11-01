$.event.props.push('dataTransfer');

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

renderUser = function(user) {
 $('#user')
  .find('.name').text(user.facebook.first_name).end()
  .find('.icon').attr('src',  'https://graph.facebook.com/' + user.facebook.id + '/picture').end();
}

renderTransfer = function(transfer) {
 transfer.used = transfer.used || 0;
 if(transfer.used > transfer.available)
  transfer.used = transfer.available;
 $('#transfer .used').css('width', (transfer.used / transfer.available) * parseFloat($('#transfer').css('width')));
}

renderFile = function(file) {
 var _id = hex_md5(file.name);
 return $('.template .file').clone()
  .find('a').attr('href', '/f/' + user._id + _id).end()
  .find('.name').text(file.name).end()
  .bind('dragstart', function(event) {
   $('#trash').fadeIn(500);
   event.dataTransfer.setData('DownloadURL', file.type + ':' + file.name + ':' + 'http://' + window.location.host + '/f/' + user._id + _id);
   event.dataTransfer.setData('text/plain', _id);
  })
  .appendTo('#dropbox').get()[0];
}

$(function() {
 socket = io.connect();

 socket.on('user', function(user) {
  renderUser(user)
  $('.login').fadeOut(500, function() {
   $('.logout').fadeIn(500);
  });
 });

 socket.on('progress', function(data) {
  $('.progress').text(Math.round(100 * data));
 });

 socket.on('transfer', function(transfer) {
  console.log(transfer);
  renderTransfer(transfer);
 });

 socket.on('file', function(f) {
  $(user.file[hex_md5(f.name)].element)
   .find('a').attr('href', f._id);
 });

 socket.on('logout', function() {
  FB.logout(function(response) {
   window.location.reload();
  });
 });

 socket.on('reconnect_failed', function() {
  console.log('reconnect failed');
 });

 if(user.facebook) {
  renderUser(user);
  $('.logout').fadeIn(500);
 }
 else
  $('.login').fadeIn(500);

 renderTransfer(user.transfer);

 for(name in user.file)
  user.file[name].element = renderFile(user.file[name]);
 
 $('#dropbox').bind('dragover', false);
 $('#dropbox').bind('drop', function(event) {
  for(var i = 0, f; f = event.dataTransfer.files[i]; i++) {
/*
   var fileReader = new FileReader();
   fileReader.onload = (function(file) {return function(event) {
   }})(f);
   fileReader.readAsBinaryString(f);
*/
  
   var _id = hex_md5(f.name);
   var name = f.name;
   user.file = user.file || {};
   if(user.file[_id])
    name += ' (2)';

   var formData = new FormData();
   formData.append(name, f);

   user.file[_id] = {
    'name': name
   }
   user.file[_id].element = renderFile(user.file[_id]);

   console.log(user.file[_id]);

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

 $('#trash').bind('dragover', false);

 $('#trash').bind('drop', function(event) {
  var _id = event.dataTransfer.getData('text/plain');
  socket.emit('delete', {_id: _id});
  $(user.file[_id].element).fadeOut(300, function() {
   delete user.file[_id];
  });
  $('#trash').fadeOut(300);
 });

 $('#upgrade').click(function() {
  $('#pay').fadeToggle(500);
 });

 window.fbAsyncInit = function() {
  FB.init({
   appId: facebook.appId,
   status: true,
   cookie: true,
   oauth: true,
   xfbml: true
  });
  FB.Event.subscribe('auth.login', function(response) {
   console.log('auth.login');
   socket.emit('authResponse', response.authResponse);
  });
 }

 $('#user .login').bind('click', function() {
  FB.login();
 });

 $('.logout a').click(function() {
  console.log('logout');
  socket.emit('logout');
 });
});