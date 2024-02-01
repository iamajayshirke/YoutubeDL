const express = require("express");
const axios = require('axios');
const fs = require("fs");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");

// from https://codewithmark.com/learn-to-create-youtube-video-downloader
function qsToJson(qs) {
    var res = {};
    var pars = qs.split('&');
    var kv, k, v;
    for (i in pars) {
        kv = pars[i].split('=');
        k = kv[0];
        v = kv[1];
        res[k] = decodeURIComponent(v);
    }
    return res;
}
// from https://davidwalsh.name/query-string-javascript
function getUrlParameter(search, name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
};

async function youTubeVideoInfo(id,url) {
    // var url = 'http://www.youtube.com/get_video_info?html5=1&video_id=' + id;
    const videoInfo = await ytdl.getInfo();
    console.log(videoInfo)
    const videoInfoResponse = await axios.get(url);
    console.log(videoInfoResponse,"response info")
    if (videoInfoResponse.status != 200) {
        throw new Error(`YouTube get video info failed: ${videoInfoResponse.status} - ${videoInfoResponse.statusText}`);
    }
    var get_video_info = qsToJson(videoInfoResponse.data);

    // remapping urls into an array of objects
    var tmp = get_video_info["url_encoded_fmt_stream_map"];
    if (tmp) {
        tmp = tmp.split(',');
        for (i in tmp) {
            tmp[i] = qsToJson(tmp[i]);
        }
        get_video_info["url_encoded_fmt_stream_map"] = tmp;
    }

    return get_video_info;
}

const app = express();

const videoFileMap = {
  cdn: "videos/video1.mp4",
  "generate-pass": "videos/video2.mp4",
  "get-post": "videos/video3.mp4",
};

app.get('/youtube2mp4', async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    if (req.query.url) {
        try {
            youTubeVideoUrl = req.query.url;
            console.log(youTubeVideoUrl,"YT Url")
            youTubeVideoId = getUrlParameter(youTubeVideoUrl.substring(youTubeVideoUrl.indexOf('?')), 'v');
            console.log(youTubeVideoId,"Video Id")
            const videoInfo = await youTubeVideoInfo(youTubeVideoId,youTubeVideoUrl);
            console.log(videoInfo,"InfoVideo")
            if (videoInfo.status === 'failed') {
                throw(new Error(`Failed due to: ${videoInfo.reason}`));
            }
            if (!!videoInfo && !!videoInfo.url_encoded_fmt_stream_map) {
                const mp4VideoEntry = videoInfo.url_encoded_fmt_stream_map.find(v => v.type.startsWith('video/mp4'));
                if (!mp4VideoEntry) {
                    throw(new Error(`Failed to resolve mp4 video for ${youTubeVideoUrl}`));
                }
                res.send(`{success:true,url:'${mp4VideoEntry.url}'}`);
            } else {
                throw(new Error(`Failed to resolve mp4 video for ${youTubeVideoUrl}`));
            }
        } catch(error) {
            res.send(`{success:false,error:'${error.message}'}`);
        }
    } else {
        res.send(`{success:false,error:'Url parameter missing'}`);
    }
});

app.get("/videos/:filename.mp4", (req, res) => {
  const fileName = req.params.filename;
  const filePath = videoFileMap[fileName];

  if (!filePath) {
    return res.status(404).send("File not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});
app.get("/video/stream", (req, res) => {
    console.log(req.query.url)
    const {url} = req.query
    res.header("Content-Disposition", 'attachment; filename="video.mp4"');
    ytdl(url, {
      format: "mp4",
    }).pipe(res);
});

app.listen(3000, () => {
  console.log("server is listening on post 3000");
});
