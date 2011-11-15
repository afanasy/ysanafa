$.event.props.push('dataTransfer', 'pageX', 'pageY');

function addCss(name) {
 var link = document.createElement('link'); link.rel = 'stylesheet'; link.async = true;
 link.href = '/stylesheets/' + name + '.css';
 var l = document.getElementsByTagName('link')[1]; l.parentNode.insertBefore(link, l);
}

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

dragOn = false;
if(window.navigator.userAgent.indexOf('AppleWebKit') > 0) {
 dragOn = true;
 addCss('webkit');
}

dropIn = true;
if(window.navigator.userAgent.indexOf('MSIE') > 0) {
 dropIn = false;
 addCss('msie');
}

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
// transfer.done = .5;
// transfer.available = 1.;
 $('#transfer .done').css('width', (transfer.done / transfer.available) * parseInt($('#transfer .progress').css('width'), 10));
 var available = transfer.available;
 var suffix = 'GB';
 var size = 3;
 if(available < 1) {
  available *= (1 << 10);
  suffix = 'MB';
  size = 0;
 }
 available = available.toString();
 if(available.indexOf('.') > 0)
  available = available.substr(0, (available.indexOf('.') + size));
 $('#transfer .available').text(available + suffix);
}

renderFile = function(file) {
 if(!file.name)
  return;
 var _id = hex_md5(file.name);
 var href = file['ggl'] ? 'http://goo.gl/' + file['ggl']: 'http://' + window.location.host + '/file/' + user._id + '/' + _id + '/' + encodeURIComponent(file.name);
 var element = $('.template .file').clone()
  .css('left', file.x)
  .css('top', file.y)
  .find('a').attr('href', href).end()
  .find('.name').text(file.name).end()
  .appendTo('#dropbox').fadeIn(300).get(0);
 if(dragOn) {
  $(element).attr('draggable', 'true')
  .on('dragstart', function(event) {
    $('#trash').fadeIn(300);
    event.dataTransfer.setData('text/plain', href);
    if(window.navigator.userAgent.indexOf('Windows') < 0)
     event.dataTransfer.setData('DownloadURL', file.type + ':' + file.name + ':' + href);
    $('#dropbox').attr('dragId', _id);
    $(this).attr('x', (event.pageX - parseInt($(this).css('left'), 10)));
    $(this).attr('y', (event.pageY - parseInt($(this).css('top'), 10)));
   })
   .on('dragend', function(event) {
    if(!$('#dropbox').attr('dragId')) {
     var x = ($('#dropbox').attr('dragoverX') - $(this).attr('x'));
     var y = ($('#dropbox').attr('dragoverY') - $(this).attr('y'));
     user.file[_id].x = x;
     user.file[_id].y = y;
     socket.emit('file', {_id: _id, x: x, y: y});
     $(this).css('left', x);
     $(this).css('top', y);
    }
    $('#dropbox').removeAttr('dragId');
    $('#trash').fadeOut(300);
    return false;
   })
 }
 else {
  $(element).attr('draggable', 'false')
   .on('mousedown', function(event) {
    $('#dropbox').attr('dragId', _id);
    $(this).attr('x', (event.pageX - parseInt($(this).css('left'), 10)));
    $(this).attr('y', (event.pageY - parseInt($(this).css('top'), 10)));
    $('#dropbox, #trash').on('mousemove', function(event) {
     $('#trash').fadeIn(300);
     var _id = $('#dropbox').attr('dragId');
     var element = user.file[_id].element;
     var x = (event.pageX - $(element).attr('x'));
     var y = (event.pageY - $(element).attr('y'));
     user.file[_id].x = x;
     user.file[_id].y = y;
     socket.emit('file', {_id: _id, x: x, y: y});
     $(element).css('left', x);
     $(element).css('top', y);
    })
    $('#trash').on('mouseup', function(event) {
     deleteFile();
     $('#dropbox, #trash').off('mousemove');
     $('#trash').off('mouseup');
     $('#dropbox').removeAttr('dragId');
     $('#trash').fadeOut(300);
    });
   })
   .on('mouseup', function() {
    $('#dropbox, #trash').off('mousemove');
    $('#trash').off('mouseup');
    $('#dropbox').removeAttr('dragId');
    $('#trash').fadeOut(300);
   })
 }
  
 user.file[_id].element = element;
}

prepareFile = function(file) {
 user.file = user.file || {};
  
 var name = file.name;
 var _id = hex_md5(name);
 var extension = ((/.+(\.[^\. ]+)$/).exec(name) || [])[1];
   
 while(true) {
  if(user.file[_id]) {
   if(extension)
    name = name.substr(0, name.length - extension.length) + ' copy' + extension;
   else
    name += ' copy';
   _id = hex_md5(name);
  }
  else
   break;
 }

 var f = {
  name: name
 }
 if(file.x)
  f.x = file.x;
 if(file.y)
  f.y = file.x;
 if(file.size) {
  f.data = {
   size: file.size
  }
 }
 
 user.file[_id] = f;
 return _id;
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
   channelURL: '//' + window.location.host + '/facebookChannel',
   status: true,
   cookie: true,
   oauth: true,
   xfbml: true
  });
  FB.Event.subscribe('auth.login', function(response) {
   socket.emit('authResponse', response.authResponse);
  });
 }

 socket = io.connect();

 socket.on('user', function(user) {
  renderUser(user)
  $('.login').fadeOut(500, function() {
   $('.info').fadeIn(500);
  });
 });

 socket.on('progress', function(progress) {
  if(progress._id && user.file[progress._id]) {
   var width = progress.done * parseInt($(user.file[progress._id].element).find('.progress').css('width'), 10);
   if(width > 5)
    $(user.file[progress._id].element).find('.progress .done').css('width', width);
   if(progress.done == 1)
    $(user.file[progress._id].element).find('.progress').fadeOut(300);
  }
 });

 socket.on('transfer', function(transfer) {
  renderTransfer(transfer);
 });

 socket.on('file', function(f) {
  $(user.file[hex_md5(f.name)].element)
   .find('a').attr('href', 'http://goo.gl/' + f['ggl']);
 });

 socket.on('delete', function(_id) {
  if(!user.file[_id])
   return;
  $(user.file[_id].element).fadeOut(300, function() {
   delete user.file[_id];
   toggleHeadline();
  });
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
 });

 if(user.facebook) {
  renderUser(user);
  $('.info').fadeIn(500);
 }
 else
  $('.login').fadeIn(500);

 $('#paypal input[name="custom"]').val(user._id);

// user.transfer.done = 0.1;
// renderTransfer(user.transfer);

// $('.file .progress').show(0);
// $('.file .done').css('width', 30);

 user.file = user.file || {};
 for(var _id in user.file)
  renderFile(user.file[_id]);

 if(!dropIn) {
  $('#upload').show(0);
  $('#headline').hide(0);
 }
 else
  toggleHeadline();  
 
 $('#dropbox').bind('dragover', function(event) {
  $(this).attr('dragoverX', event.pageX);
  $(this).attr('dragoverY', event.pageY);
  return false;
 });
 $('#dropbox').bind('drop', function(event) {
  $(this).removeAttr('dragId');
  for(var i = 0, f; f = event.dataTransfer.files[i]; i++) {
   if((parseFloat(user.transfer.done) + (f.size / (1 << 30))) > parseFloat(user.transfer.available)) {
    $('#transfer .done').addClass('blink');
    setTimeout(function() {
     $('#transfer .done').removeClass('blink');
    }, 2000);
    break;
   }
   
   f.x = (event.pageX - 64);
   f.y = (event.pageY - 64);
   var _id = prepareFile(f);

   var formData = new FormData();
   formData.append(_id, JSON.stringify(user.file[_id]));   
   formData.append(_id, f);

   user.file[_id].upload = $.ajax({
    'type': 'POST',
    'url': '/upload', 
    'contentType': false,
    'data': formData,
    'processData': false
   });

   $('#headline').fadeOut(300);
   _gaq.push(['_trackEvent', 'Upload', 'start', user.file[_id].name]);
   renderFile(user.file[_id]);
   $(user.file[_id].element).find('.progress').fadeIn(0);
  }
  return false;
 });

 deleteFile = function() {
  var _id = $('#dropbox').attr('dragId');
  if(!user.file[_id])
   return false;
  if(user.file[_id].upload)
   user.file[_id].upload.abort();
  socket.emit('delete', {_id: _id});
  $('#trash').fadeOut(300);
  $(user.file[_id].element).fadeOut(300, function() {
   delete user.file[_id];
   toggleHeadline();
  });
 }

 $('#trash').bind('dragover', false);

 $('#trash').bind('drop', function(event) {
  deleteFile();
  return false;
 });

 $('#transfer .upgrade').click(function() {
  $('#pay').fadeToggle(500);
 });

 $('#user .login').bind('click', function() {
  _gaq.push(['_trackEvent', 'Login', 'click']);
  FB.getLoginStatus(function(response) {
   if (response.authResponse) {
    FB.logout(function(response) {
     FB.login();
    });
   }
   else
    FB.login();
  });
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

 $('#upload input').on('change', function(event) {
  var name = $(this).val().replace(/C:\\fakepath\\/i, '');
  var file = {
   name: name,
   x: 100,
   y: 100
  }
  var _id = prepareFile(file);
  $(this).attr('name', _id);
  $.ajax({
   'type': 'POST',
   'url': '/upload', 
   'fileInput': $(this),
   'formData': [{name: _id, value: JSON.stringify(user.file[_id])}],
   'dataType': 'iframe'
  });

  $('#headline').fadeOut(300);
  _gaq.push(['_trackEvent', 'Upload', 'start', user.file[_id].name]);
  renderFile(user.file[_id]);
  $(user.file[_id].element).find('.progress').fadeIn(0);
 });

 $('.logout').click(function() {
  socket.emit('logout');
 });
});
