/*global nodeca, _, $, Modernizr, Backbone, window, Faye*/


"use strict";


module.exports = function () {
  var
    // jQuery $elements
    $fontname, $users_count, $glyphs, $import,
    // models
    fonts, result, session,
    // ui views
    toolbar, tabs, selector, preview, editor;


  // check browser's capabilities
  if (!Modernizr.fontface) {
    nodeca.logger.error("bad browser");
    $('#err-bad-browser').modal({backdrop: 'static', keyboard: false});
    return;
  }


  //
  // Models
  //


  // list of all fonts
  fonts = new (Backbone.Collection.extend({
    model: nodeca.client.fontomas.models.font
  }))(nodeca.shared.fontomas.embedded_fonts);

  // special collection of selected glyphs (cache) with
  // extra model logic (validate, config creation and
  // download requesting), but which can still be used
  // as a normal collection for the views
  result = new nodeca.client.fontomas.models.result;


  //
  // Views (UI)
  //


  toolbar   = new nodeca.client.fontomas.ui.toolbar;
  tabs      = new nodeca.client.fontomas.ui.tabs;
  selector  = new nodeca.client.fontomas.ui.panes.selector({model: fonts});
  preview   = new nodeca.client.fontomas.ui.panes.preview({model: result});
  editor    = new nodeca.client.fontomas.ui.panes.codes_editor({model: result});


  //
  // Initialization
  //


  fonts.each(function (f) {
    f.eachGlyph(function (g) {
      toolbar.addKeywords(g.get('source').search || []);
      g.on('change:selected', function (g, val) {
        result[val ? 'add' : 'remove'](g);
      });
    });
  });


  toolbar.on('click:download', function () {
    result.startDownload($('#result-fontname').val());
  });


  toolbar.on('change:glyph-size', _.debounce(function (size) {
    selector.changeGlyphSize(size);
  }, 250));


  // perform glyphs search
  $glyphs = $('.glyph');
  toolbar.on('change:search', function (q) {
    q = $.trim(q);

    if (0 === q.length) {
      $glyphs.show();
      return;
    }

    $glyphs.hide().filter(function () {
      var model = $(this).data('model');
      return model && 0 <= model.keywords.indexOf(q);
    }).show();
  });


  // update selected glyphs count
  result.on('add remove', function () {
    var count = result.length;

    toolbar.setGlyphsCount(count);
    tabs.setGlyphsCount(count);
  });


  // show selector tab after  load complete
  tabs.activate('#selector');


  // Attach tooltip handler to matching elements
  $('._tip').tooltip();


  // Attach collapse handler to matching elements
  $('._collapser').ndCollapser();


  //
  // Initialize clear (selections) button
  //


  $('#reset-app-selections').click(function (event) {
    // do not change location
    event.preventDefault();

    fonts.each(function (f) {
      f.eachGlyph(function (g) {
        g.toggle('selected', false);
      });
    });
  });


  //
  // Initialize reset everything button
  //


  $('#reset-app-all').click(function (event) {
    // do not change location
    event.preventDefault();

    fonts.each(function (f) {
      f.eachGlyph(function (g) {
        g.toggle('selected', false);
        g.unset('code');
        g.unset('css');
      });
    });
  });


  //
  // Fontname
  //


  $fontname = $('#result-fontname');
  $fontname.on('keyup change', function () {
    var $el = $(this);
    $el.val($el.val().replace(/[^a-z0-9\-_]+/g, ''));
  });


  //
  // Sessions
  //


  // Session manager instance
  session = new nodeca.client.fontomas.sessions({
    fontnameElement:  $fontname,
    fontsList:        fonts
  });


  var save_session = _.debounce(function () {
    session.save();
  }, 5000);


  // save current state upon fontname change
  $fontname.change(save_session);


  // change current state when some of glyph properties were changed
  fonts.each(function (f) {
    f.on('before:batch-select', function () {
      nodeca.client.fontomas.sessions.disable();
    });

    f.on('after:batch-select', function () {
      nodeca.client.fontomas.sessions.enable();
      save_session();
    });

    f.eachGlyph(function (g) {
      g.on('change:selected change:code change:css', save_session);
    });
  });


  session.load();


  if ('development' === nodeca.runtime.env) {
    // export some internal collections for debugging
    window.fontello_fonts   = fonts;
    window.fontello_result  = result;
  }


  //
  // Initialize config reader
  //


  $import = $('#import-app-config-btn');

  $import.click(function (event) {
    event.preventDefault();

    if (!window.FileReader) {
      nodeca.client.fontomas.util.notify('error',
        nodeca.client.fontomas.render('error:no-config-import'));
      return false;
    }

    $('#import-app-config').click();
    return false;
  });

  // handle file upload
  $('#import-app-config').change(function (event) {
    var file = (event.target.files || [])[0], reader;

    if (!file || 'application/json' !== file.type) {
      nodeca.client.fontomas.util.notify('error',
        nodeca.client.fontomas.render('error:invalid-config-file'));
      return;
    }

    reader = new window.FileReader();

    reader.onload = function (event) {
      var config;

      try {
        config = JSON.parse(event.target.result);
      } catch (err) {
        nodeca.client.fontomas.util.notify('error',
          nodeca.client.fontomas.render('error:read-config-failed', {
            error: (err.message || err.toString())
          }));
        return;
      }

      session.readConfig(config);
    };

    reader.readAsBinaryString(file);
  });


  //
  // Initialize Faye
  //


  nodeca.io.init();


  nodeca.io.on('rpc:version-mismatch', function (/* versions */) {
    nodeca.client.fontomas.util.notify('error', {layout: 'bottom'},
      nodeca.client.fontomas.render('error:rpc:server-mismatch'));
  });


  //
  // live update of amount of online clients
  //


  $users_count = $('#stats-online');
  nodeca.io.subscribe('/stats/users_online', function (count) {
    $users_count.text(count);
  }).fail(function (err) {
    nodeca.logger.error('Failed subscribe for stats updates: ' + err);
  });

};
