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
 transfer.done = transfer.done || 0;
 if(transfer.done > transfer.available)
  transfer.done = transfer.available;
 transfer.done = .5;
 transfer.available = 1.;
 $('#transfer .done').css('width', (transfer.done / transfer.available) * parseFloat($('#transfer .progress').css('width')));
}

renderFile = function(file) {
 var _id = hex_md5(file.name);
 return $('.template .file').clone()
  .css('left', file.x)
  .css('top', file.y)
  .find('a').attr('href', '/f/' + user._id + _id).end()
  .find('.name').text(file.name).end()
  .bind('dragstart', function(event) {
   $('#trash').fadeIn(300);
   event.dataTransfer.setData('DownloadURL', file.type + ':' + file.name + ':' + 'http://' + window.location.host + '/f/' + user._id + _id);
   event.dataTransfer.setData('text/plain', _id);
   this.x = (event.clientX - parseFloat($(this).css('left')));
   this.y = (event.clientY - parseFloat($(this).css('top')));
  })
  .bind('dragend', function(event) {
   user.file[_id].x = x = (event.clientX - this.x);
   user.file[_id].y = y = (event.clientY - this.y);
   socket.emit('file', {_id: _id, x: x, y: y});
   $(this).css('left', x);
   $(this).css('top', y);
   $('#trash').fadeOut(300);
  })
  .appendTo('#dropbox').fadeIn(300).get()[0];
}

toggleHeadline = function() {
 var showHeadline = true;
 if(user.file)
  for(_id in user.file) {
   showHeadline = false;
   break;
  }
 if(showHeadline)
  $('#headline').fadeIn(500);
 else
  $('#headline').fadeOut(500);
}

$(function() {
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

 socket = io.connect();

 socket.on('user', function(user) {
  renderUser(user)
  $('.login').fadeOut(500, function() {
   $('.logout').fadeIn(500);
  });
 });

 socket.on('progress', function(progress) {
  if(progress._id) {
   $(user.file[progress._id].element).find('.progress .done').css('width', progress.done * parseFloat($(user.file[progress._id].element).find('.progress').css('width')));
   if(progress.done == 1)
    $(user.file[progress._id].element).find('.progress').fadeOut(300);
  }
 });

 socket.on('transfer', function(transfer) {
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

 socket.on('reload', function() {
  window.location.reload();
 });

 socket.on('reconnect_failed', function() {
  console.log('reconnect failed');
 });

 if(user.facebook) {
  renderUser(user);
  $('.info').fadeIn(500);
 }
 else
  $('.login').fadeIn(500);

 $('#paypal input[name="custom"]').val(user._id);

 renderTransfer(user.transfer);

 var x = 0;
 var y = 0;
 for(name in user.file) {
  user.file[name].element = renderFile(user.file[name], x, y);
  y += 200;
 }
 
 toggleHeadline();
 
 $('#dropbox').bind('dragover', false);
 $('#dropbox').bind('drop', function(event) {
  for(var i = 0, f; f = event.dataTransfer.files[i]; i++) {
/*
   var fileReader = new FileReader();
   fileReader.onload = (function(file) {return function(event) {
   }})(f);
   fileReader.readAsBinaryString(f);
*/
   user.file = user.file || {};
  
   var name = f.name;
   var _id = hex_md5(name);

   while(true) {
    if(user.file[_id]) {
     name += ' copy';
    _id = hex_md5(name);
    }
    else
     break;
   }

   user.file[_id] = {
    'name': name,
    'x': (event.clientX - 64),
    'y': (event.clientY - 64),
    'data': {
     'size': f.size
    }
   }

   var formData = new FormData();
   formData.append(_id, JSON.stringify(user.file[_id]));
   
   user.file[_id].element = renderFile(user.file[_id]);
   $(user.file[_id].element).find('.progress').fadeIn(0);

   formData.append(_id, f);

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

   $('#headline').fadeOut(300);

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
   $('#trash').fadeOut(300);
   toggleHeadline();
  });
 });

 $('#transfer .upgrade').click(function() {
  $('#pay').fadeToggle(500);
 });

 $('#user .login').bind('click', function() {
  FB.login();
 });

 $('#user .info').bind('mouseenter', function() {
  $('.logout').fadeIn(100);
  return false;
 });

 $('#user .info').bind('mouseleave', function() {
  $('.logout').fadeOut(100);
  return false;
 });

 $('#paypal .option').click(function() {
  $('#paypal form input[name="os0"]').val($(this).find('.value').text());
  $('#paypal form').submit();
 });

 $('#paypal .buy').click(function() {
  $('#paypal form').submit();
 });

 $('.logout').click(function() {
  socket.emit('logout');
 });
});
