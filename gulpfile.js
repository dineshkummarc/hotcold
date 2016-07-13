var gulp = require( "gulp" ),
    mainBowerFiles = require( "main-bower-files" ),
    print = require( "gulp-print" ),
    gulp_if = require("gulp-if"),
    clean = require( "gulp-clean" ),
    rename = require( "gulp-rename" ),
    htmlmin = require( "gulp-htmlmin" ),
    sass = require( "gulp-sass" ),
    replace = require( "gulp-replace-task" ),
    prettify = require( "gulp-prettify" ),
    browserify = require( "browserify" ),
    merge_stream = require( "merge-stream" ),
    source = require( 'vinyl-source-stream' ),
    jsValidate = require( "gulp-jsvalidate" ),
    runSequence = require( "run-sequence" ),
    HC_CONFIG = require( "./config.json" ),

    _ = require( "underscore" ),
    zip = require( "gulp-zip" ),
    tar = require( "gulp-tar" ),
    gzip = require( "gulp-gzip" ),

    async = require( "async" ),
    pump = require( "pump" ),
    json_editor = require( "gulp-json-editor" ),
    uglify = require( "gulp-uglify" )
    
    git_info = require( "git-rev" ),
    git = require( "gulp-git" ),
    
    vfs = require( "vinyl-fs" ),

    // to change the icons for the windows executables
    rcedit = require( "rcedit" );

var ELECTRON_PACKAGER = require( "electron-packager" );

// clean the directories like "lib"
gulp.task( "clean", function () {
    return gulp.src( "./lib/", { read: false } )
        .pipe( clean() );
} );

// copy fonts
gulp.task( "copy-fonts", function () {
    return gulp.src( mainBowerFiles( "**/*.{woff,woff2,eot,svg,ttf}" ) )
        .pipe( gulp.dest( "./lib/fonts/" ) )
} );

// copy "js" libraries 
gulp.task( "copy-js-lib", function () {
    console.log( "copying js lib ", HC_CONFIG.APPMODE );
    return gulp.src( mainBowerFiles( "**/*/*.js" ) )
        .pipe( gulp.dest( "./lib/js/" ) )
} );

// copy "css" libraries
gulp.task( "copy-css-lib", function () {
    console.log( "copying css lib" );
    return gulp.src( mainBowerFiles( "**/*.css" ) )
        .pipe( gulp.dest( "./lib/css" ) )
} );

// copy "src sass" as css
gulp.task( "convert-scss", function () {
    return gulp.src( "./css/scss/**/*.scss" )
        .pipe( sass() )
        .pipe( prettify() )
        .pipe( gulp.dest( "./css/" ) )
} );

gulp.task( "lint", function () {
    return gulp.src( "./js/**/*.js" )
        .pipe( jsValidate() );
} )

gulp.task( "browserify", function () {
    return browserify( './js/src/app.js' )
        .bundle()
        //Pass desired output filename to vinyl-source-stream
        .pipe( source( 'APP.js' ) )
        // Start piping stream to tasks!
        .pipe( gulp.dest( './js/' ) );
} );

gulp.task( "default", function ( cb ) {
    runSequence( [ "clean" ], [ "copy-js-lib", "copy-css-lib", "copy-fonts" ], [ "lint" ], [ "convert-scss", "browserify" ], cb );
} );

gulp.task( "build-releases", function ( cb ) {
    runSequence( [ "clean-releases" ], [ "build-crx", "build-electron" ], cb );
} );

gulp.task( "build-web", function (cb) {
    runSequence( ["default"], ["clean-web"], ["copy-web-files"], cb );
} );

gulp.task( "check-branch", function ( cb ) {
    git_info.branch( function ( branch ) {
        console.log( "branch is ", branch );
        if ( branch == "gh-pages" ) {
            build_website();
        }
    } );
    git_info.tag( function ( tag ) {
        console.log( "latest tag is ", tag );
    } );
    cb();
} );

// ----------------------------------------------------------------------------------------------------
// START: build web tasks

// clean the web folder
// cleans the releases folder
gulp.task( "clean-web", function () {
    console.log( "cleaning web folder" );
    return gulp.src( "./web/", { read: false } )
        .pipe( clean() );
} );

gulp.task( "copy-web-files", function ( cb ) {

    console.log( "copying web files" );

    var destination = "./web/";

    // copy the main index file as courses.html
    var copy_courses_page = gulp.src( "./index.html" )
                                .pipe( rename("courses.html") )
                                .pipe(htmlmin({collapseWhitespace: true}))
                                .pipe( gulp.dest( destination ) );

    var download_links = _.map( HC_CONFIG.downloads, function (link, platform) {
        return {
            match: new RegExp( "{{" + platform + "}}" ),
            replacement: link
        }
    } );

    // copy the home.html as index file
    var copy_home_page = gulp.src( "./home.html" )
                                .pipe( rename("index.html") )
                                // replace the download links from config
                                .pipe( replace({
                                    patterns: download_links
                                }) )
                                .pipe(htmlmin({collapseWhitespace: true}))
                                .pipe( gulp.dest( destination ) );

    // copy config file and change the mode to "web"
    var copy_config = gulp.src( "./config.json" )
                                .pipe( 
                                    json_editor({
                                        "type": "web"
                                    }) 
                                )
                                .pipe( gulp.dest( destination ) );

    var copy_help_file = gulp.src( "./help.html" )
                            .pipe( gulp.dest( destination ) );

    var copy_lib = gulp.src( "./lib/**/*", { base: "." } )
                        .pipe( gulp.dest( destination ) );

    var copy_js = gulp.src( "./js/*.js", { base: "." } )
                        .pipe( 
                            uglify({ 
                                compress: {
                                    drop_console: true
                                }  
                            }) 
                        )
                        .pipe( gulp.dest( destination ) );

    var copy_css = gulp.src( "./css/*.css", { base: "." } )
                        .pipe( gulp.dest( destination ) );

    var copy_lessons = gulp.src( "./lessons/**/*", { base: "." } )
                            .pipe( gulp.dest( destination ) );

    var copy_images = gulp.src( "./images/*", { base: "." } )
                            .pipe( gulp.dest( destination ) );

    var copy_favicon = gulp.src( "./favicon.ico" )
        .pipe( gulp.dest( destination ) );

    return merge_stream( 
                copy_home_page,
                copy_courses_page, 
                copy_help_file, 
                copy_lib, 
                copy_js, 
                copy_css, 
                copy_lessons, 
                copy_images, 
                copy_favicon,
                copy_config 
            );

} );

// END: build web tasks
// ----------------------------------------------------------------------------------------------------

// cleans the releases folder
gulp.task( "clean-releases", function () {
    console.log( "cleaning releases folder" );
    return gulp.src( "./releases/", { read: false } )
        .pipe( clean() );
} );

// ----------------------------------------------------------------------------------------------------
// START: chrome extension tasks

gulp.task( "build-crx", function ( cb ) {
    runSequence( [ "default" ], [ "clean-crx" ], [ "copy-crx-files" ], cb );
} );

gulp.task( "clean-crx", function ( cb ) {
    console.log( "deleting crx folder" )
    return gulp.src( "./releases/chrome-app", { read: false } )
        .pipe( clean() );
} );

gulp.task( "copy-crx-files", function (cb) {

    var modes = ["FREE", "PRO"];

    _.each( modes, function (mode) {
        copy_crx_files( mode );
    } );

    cb();

} );

function copy_crx_files (mode) {

    var crx_destination = "./releases/chrome-app/" + mode;

    console.log("copying chrome extension files for ", mode);

    var copy_index_file = gulp.src( "./index.html" )
                                .pipe( gulp.dest( crx_destination ) );

    // copy config file and change the mode to "web"
    var copy_config = gulp.src( "./config.json" )
                                .pipe( 
                                    json_editor({
                                        "type": "crx",
                                        "APPMODE": mode
                                    }) 
                                )
                                .pipe( gulp.dest( crx_destination ) );

    var copy_help_file = gulp.src( "./help.html" )
                                .pipe( gulp.dest( crx_destination ) );

    var copy_lib = gulp.src( "./lib/**/*", { base: "." } )
                        .pipe( gulp.dest( crx_destination ) );

    var copy_js = gulp.src( "./js/*.js", { base: "." } )
                        .pipe( 
                            uglify({ 
                                compress: {
                                    drop_console: true
                                }  
                            }) 
                        )
                        .pipe( gulp.dest( crx_destination ) );

    var copy_css = gulp.src( "./css/hotcold.css", { base: "." } )
                        .pipe( gulp.dest( crx_destination ) );

    var copy_lessons = gulp.src( "./lessons/**/*", { base: "." } )
                            .pipe( gulp.dest( crx_destination ) );

    var copy_images = gulp.src( "./images/viralgal.png", { base: "." } )
                            .pipe( gulp.dest( crx_destination ) );

    var copy_manifest = gulp.src( "./manifest.json" )
                            .pipe( gulp.dest( crx_destination ) );

    var copy_init_script = gulp.src( "./init_crx.js" )
                                .pipe( gulp.dest( crx_destination ) );

    var copy_icons = gulp.src( "./icon/icon-*.png" )
                            .pipe( gulp.dest( crx_destination ) );

    var copy_favicon = gulp.src( "./favicon.ico" )
                            .pipe( gulp.dest( crx_destination ) );

    merge_stream( 
        copy_index_file, 
        copy_help_file, 
        copy_lib, 
        copy_js, 
        copy_css, 
        copy_lessons, 
        copy_images, 
        copy_manifest, 
        copy_init_script, 
        copy_icons,
        copy_config
    );

}

// END: chrome extension tasks
// ----------------------------------------------------------------------------------------------------

// ----------------------------------------------------------------------------------------------------
// START: electron tasks

gulp.task( "build-electron", function ( cb ) {
    runSequence( [ "default" ], [ "clean-electron" ], [ "wrap-electron-build" ], [ "prepare-electron-binary" ], cb );
} );

gulp.task( "clean-electron", function ( cb ) {
    console.log( "deleting electron build folder" )
    return gulp.src( "./releases/electron", { read: false } )
        .pipe( clean() );
} );

gulp.task( "wrap-electron-build", function ( cb ) {

    console.log( "wrapping electron build" );

    var electron_destination = "./releases/electron/";
    
    // copying all the required files
    
    // first index file
    electron_copy_index_file();

    // copy config file and change the mode to "web"
    var copy_config = gulp.src( "./config.json" )
                                .pipe( 
                                    json_editor({
                                        "type": "desktop"
                                    }) 
                                )
                                .pipe( gulp.dest( electron_destination ) );

    // copy the help html file
    var copy_help_file = gulp.src( "./help.html", { base: "." } )
                                .pipe( gulp.dest( electron_destination ) );

    // copy icons "hc-logo.*"
    var copy_icons = gulp.src( "./icon/hc-logo.{icns,ico,png}" )
                        .pipe( gulp.dest( electron_destination ) );

    // now all the libraries/css/js
    var copy_electron_lib = gulp.src( "./lib/**/*", { base: "." } )
                                .pipe( gulp.dest( electron_destination ) );

    var copy_electron_js = gulp.src( "./js/*.js", { base: "." } )
                                .pipe( 
                                    uglify({ 
                                        compress: {
                                            drop_console: true
                                        }  
                                    }) 
                                )
                                .pipe( gulp.dest( electron_destination ) );

    var copy_electron_css = gulp.src( "./css/hotcold.css", { base: "." } )
                                .pipe( gulp.dest( electron_destination ) );

    var copy_node_package_json = gulp.src( "./package.json*", { base: "." } )
                                    .pipe( gulp.dest( electron_destination ) );

    var electron_js = gulp.src( "./electron.js*", { base: "." } )
                            .pipe( gulp.dest( electron_destination ) );

    var copy_lessons = gulp.src( "./lessons/**/*", { base: "." } )
                            .pipe( gulp.dest( electron_destination ) );

    var copy_images = gulp.src( "./images/*.gif", { base: "." } )
                            .pipe( gulp.dest( electron_destination ) );

    return merge_stream( 
            copy_help_file, 
            copy_icons,
            copy_electron_lib, 
            copy_electron_js, 
            copy_electron_css, 
            copy_node_package_json, 
            electron_js, 
            copy_lessons, 
            copy_images,
            copy_config 
        );
} );

// prepares the binaries using electron
gulp.task( "prepare-electron-binary", function ( cb ) {
    ELECTRON_PACKAGER( {
        "arch": "all",
        "dir": "./releases/electron/",
        "platform": [ "win32", "linux", "darwin" ],
        "out": "./releases/electron/binaries/",
        "app-version": HC_CONFIG.VERSION,
        "build-version": HC_CONFIG.VERSION,
        "icon": "hc-logo"
    }, function ( err, binary_paths ) {

        binary_paths.forEach( function ( buildPath, key, orig_array ) {

            var os_platform = _.last( buildPath.split( "/" ) ).split( "-" )[ 1 ],
                build_arch = _.last( buildPath.split( "/" ) ).split( "-" )[ 2 ];

            if ( os_platform == "win32" ) {
                // use rcedit to change the icon for the windows executable binary
                rcedit( buildPath + "/hotcold.exe", {
                    icon: "./releases/electron/hc-logo.ico"
                }, function ( err ) {
                    console.log( "windows binary icon change complete ", buildPath, __dirname );
                    package_electron_build( buildPath, build_arch, os_platform );
                } );
            } else {
                package_electron_build( buildPath, build_arch, os_platform );    
            }

        } );

        cb();
    } );
} );

// START: HELPER FUNCTIONS

function electron_copy_index_file() {

    console.log( "Porumai! will copy and process electron index file ", __dirname );

    var to_replace = new RegExp('<script src="lib/js/jquery.min.js"></script>'),
        replace_with = "<script>window.$ = window.jQuery = require('./lib/js/jquery.min.js');</script>";

    gulp.src( "./index.html" )
        // replace jquery library for electron build
        .pipe( replace({
            patterns: [
                {
                    match: to_replace,
                    replacement: replace_with
                }
            ]
        }) )
        .pipe( gulp.dest( "./releases/electron/" ) );
}

function package_electron_build( buildPath, arch, os ) {

    console.log( "Porumai! packaging " + os + " build ", "./" + buildPath + "/**" );

    var file_name = "Hotcold-" + HC_CONFIG.VERSION + "-" + os + "-" + arch,
        tar_file_name = file_name + ".tar",
        zip_file_name = file_name + ".zip",
        isLinux = (os == "linux");

    // execute the steps in series
    async.series( [
        function ( next ) {
                // copy the binary
                console.log( "copying binary ", file_name, buildPath );
                // NOTE: using vinyl-fs because of symlink problems in mac/darwin binary builds
                vfs.src( "./" + buildPath + "/**/*" )
                    // move to temporary path
                    .pipe( vfs.dest( "./releases/electron/dist/" + file_name + "/" + file_name ) )
                    .on( "end", next );
        },
        function ( next ) {
                // copy the install instructions
                vfs.src( "./other/install_instructions/" + os + "/README.txt" )
                    // move to temporary path
                    .pipe( vfs.dest( "./releases/electron/dist/" + file_name + "/" + file_name ) )
                    .on( "end", next );
        },
        function ( next ) {
                // now let us tar the files
                vfs.src( "./releases/electron/dist/" + file_name + "/**" )
                    // tar if linux, zip if windows or mac
                    .pipe( gulp_if( isLinux, tar(tar_file_name), zip(zip_file_name) ) )
                    // gzip if it is linux
                    .pipe( gulp_if( isLinux, gzip() ) )
                    .pipe( vfs.dest( "./releases/electron/dist/" ) )
                    .on( "end", next );
        },
        function ( next ) {
                console.log( "cleaning up ?", "./releases/electron/dist/" + file_name );
                gulp.src( "./releases/electron/dist/" + file_name, { read: false } )
                    .pipe( clean() )
                    .on( "end", next );
        }
    ],
        function ( err, results ) {
            console.log( "RESULTS:", err, results, arguments );
        } );

}

var rcedit = require( "rcedit" );

gulp.task( "debug-windows-build", function ( cb ) {
    rcedit( "./releases/electron/binaries/hotcold-win32-x64/hotcold.exe", {
        icon: "./icon/icon.ico"
    }, function ( err ) {
        console.log( "windows debug complete" );
        cb();
    } );
} );

// END: HELPER FUNCTIONS

// END: electron tasks
// ----------------------------------------------------------------------------------------------------

// build website branch only in gh page branch
function build_website() {
    console.log( "will be building website for gh page branch" );
}