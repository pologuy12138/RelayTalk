# RelayTalk

RelayTalk 是一个轻量化、自托管的网页音视频聊天室。它只有一个固定房间，最多允许两台设备同时加入，打开网页就进入通话。

这个项目当前采用 **WebRTC 音频 + WebRTC 视频 + TURN TCP 中继** 的方案。它不再强调 P2P，因为在复杂网络里“能稳定连上”比“理论上直连”更重要。

## 项目特点

- **打开即用**：不需要账号、不需要创建房间、不需要分享房间号。
- **固定双人房间**：同时最多 2 台设备在线，第 3 台设备会被拒绝。
- **音视频都走 WebRTC**：使用浏览器成熟的采集、编码、解码、回声消除、抖动缓冲和播放能力。
- **强制 TURN TCP**：适合 UDP / P2P 不稳定、但 TCP 可连通的网络环境。
- **WebSocket 信令**：服务端只负责房间管理和 WebRTC offer/answer/candidate 转发。
- **移动端友好**：面向 Android 和 iPhone 浏览器使用。
- **网络速率显示**：页面右上角显示上传、下载 KB/s。
- **Docker 友好**：可部署在 VPS、群晖 NAS、其他 Docker 主机上。

## 架构说明

```text
浏览器 A  <-- WebSocket 信令 -->  RelayTalk 服务端  <-- WebSocket 信令 -->  浏览器 B

浏览器 A  <---------------- WebRTC 音视频 / TURN TCP 中继 ---------------->  浏览器 B
                                   coturn 或其他 TURN 服务
```

RelayTalk 的 Node.js 服务端不处理、不解码、不转码音视频。它只负责：

- 提供网页文件
- 通过 `/config.json` 下发运行配置
- 限制房间最多 2 人
- 转发 WebRTC 信令消息

真正的音视频传输由浏览器 WebRTC 完成。默认配置 `ICE_TRANSPORT_POLICY=relay` 会强制媒体通过 TURN 服务中继。

## 基础要求

- Node.js 20+ 或 Docker
- 一个客户端可连通的 TURN 服务，例如 coturn
- 手机浏览器使用摄像头和麦克风时，建议使用 HTTPS

现代浏览器通常要求摄像头和麦克风页面处于安全上下文。`localhost` 本地调试一般可以直接用 HTTP，但手机访问时建议用 HTTPS。HTTPS 不必须占用 `443` 端口，可以使用 `8444` 这类自定义端口。

## 快速部署：仅 App 容器

适合 NAS 内网、群晖反向代理、或已有 Nginx/Caddy/Traefik 的环境。

先修改 `docker-compose.app-only.yml` 里的 TURN 配置：

```yaml
environment:
  PORT: "3050"
  MAX_PEERS: "2"
  TURN_URLS: "turn:your-domain.example.com:3478?transport=tcp"
  TURN_USERNAME: "your-turn-user"
  TURN_CREDENTIAL: "your-turn-password"
  ICE_TRANSPORT_POLICY: "relay"
  VIDEO_WIDTH: "1280"
  VIDEO_HEIGHT: "720"
  VIDEO_FPS: "18"
  VIDEO_MAX_BITRATE: "3000000"
  VIDEO_START_BITRATE: "1800000"
  VIDEO_MIN_BITRATE: "800000"
  VIDEO_DEGRADATION: "maintain-resolution"
  VIDEO_PREFER_CODEC: "H264"
```

启动：

```bash
docker compose -f docker-compose.app-only.yml up -d --build
```

访问：

```text
http://NAS-IP:3050
```

如果要给手机长期使用，建议在 NAS 或网关上加 HTTPS 反向代理，并开启 WebSocket 支持。

## 快速部署：App + Nginx + 证书

适合有域名、希望直接在 VPS 或 NAS 上跑完整 HTTPS 服务的场景。

1. 将 `nginx.conf` 里的 `DOMAIN` 全部替换成你的域名。
2. 修改 `docker-compose.yml` 里 app 服务的 TURN 环境变量。
3. 确保域名 DNS 指向这台机器。
4. 首次申请证书：

```bash
docker compose run --rm certbot certonly --webroot \
  -w /var/www/certbot -d your-domain.example.com
```

5. 启动服务：

```bash
docker compose up -d --build
```

默认访问地址：

```text
https://your-domain.example.com:8444
```

## 本机运行

```bash
npm install
PORT=3050 \
MAX_PEERS=2 \
TURN_URLS='turn:your-domain.example.com:3478?transport=tcp' \
TURN_USERNAME='your-turn-user' \
TURN_CREDENTIAL='your-turn-password' \
ICE_TRANSPORT_POLICY='relay' \
VIDEO_WIDTH=1280 \
VIDEO_HEIGHT=720 \
VIDEO_FPS=18 \
VIDEO_MAX_BITRATE=3000000 \
VIDEO_START_BITRATE=1800000 \
VIDEO_MIN_BITRATE=800000 \
VIDEO_DEGRADATION=maintain-resolution \
VIDEO_PREFER_CODEC=H264 \
npm start
```

访问 `http://localhost:3050`。

## TURN / coturn 示例

coturn 示例配置：

```text
listening-port=3478
fingerprint
lt-cred-mech
user=relaytalk:change-this-password
realm=your-domain.example.com
no-multicast-peers
no-cli
```

RelayTalk 对应配置：

```text
TURN_URLS=turn:your-domain.example.com:3478?transport=tcp
TURN_USERNAME=relaytalk
TURN_CREDENTIAL=change-this-password
ICE_TRANSPORT_POLICY=relay
```

需要确保客户端能连通 TURN 的 TCP `3478` 端口。TURN 服务也可以同时开放 UDP，但本项目默认使用 TCP relay，是为了在 UDP 不稳定或受限的网络里优先保证可用性。

## 配置项

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3050` | Node.js HTTP/WebSocket 端口 |
| `MAX_PEERS` | `2` | 房间允许的最大设备数 |
| `TURN_URLS` | 占位值 | TURN 地址，多个地址可用英文逗号分隔 |
| `TURN_USERNAME` | 占位值 | TURN 用户名 |
| `TURN_CREDENTIAL` | 占位值 | TURN 密码 |
| `ICE_TRANSPORT_POLICY` | `relay` | `relay` 强制走 TURN；`all` 允许浏览器尝试直连 |
| `VIDEO_WIDTH` | `1280` | 摄像头采集目标宽度 |
| `VIDEO_HEIGHT` | `720` | 摄像头采集目标高度 |
| `VIDEO_FPS` | `18` | 摄像头采集和发送目标帧率 |
| `VIDEO_MAX_BITRATE` | `3000000` | 视频最大发送码率，单位 bps |
| `VIDEO_START_BITRATE` | `1800000` | Chrome 等浏览器可参考的视频起步码率，单位 bps |
| `VIDEO_MIN_BITRATE` | `800000` | Chrome 等浏览器可参考的视频最低码率，单位 bps |
| `VIDEO_DEGRADATION` | `maintain-resolution` | 拥塞时优先保持分辨率，还是优先保持帧率 |
| `VIDEO_PREFER_CODEC` | `H264` | 优先使用的视频编码，手机硬编通常对 H264 更友好 |

视频质量参数在 `public/index.html` 里：

```javascript
video:{width:{ideal:vc.width},height:{ideal:vc.height},frameRate:{ideal:vc.frameRate,max:vc.frameRate}}
params.encodings[0].maxBitrate=vc.maxBitrate;
```

如果带宽足够，可以把 `VIDEO_MAX_BITRATE` 提高到 `3500000` 或更高；如果画面卡顿，就降低码率或帧率。

## 画质与卡顿说明

RelayTalk 默认强制走 TURN TCP。这个方案的优点是连通性通常更稳，缺点是视频链路会更容易触发 WebRTC 拥塞控制。

WebRTC 会根据网络状态自动调节码率、帧率和清晰度。即使设置了较高的 `VIDEO_MAX_BITRATE`，浏览器也可能在以下情况主动降码率：

- TURN TCP 链路延迟或抖动较高
- 上下行带宽不足
- 手机 CPU / 硬件编码能力不足
- TCP 队头阻塞导致短时间积压

页面底部调试行会显示类似：

```text
TX:1280x720@18 | RX:1280x720@18 | Q:bandwidth
```

`Q:bandwidth` 表示浏览器认为主要受网络限制，`Q:cpu` 表示主要受设备性能限制，`Q:none` 表示当前没有明显限制。

如果要优先清晰，可以尝试：

```yaml
VIDEO_WIDTH: "1280"
VIDEO_HEIGHT: "720"
VIDEO_FPS: "15"
VIDEO_MAX_BITRATE: "3500000"
VIDEO_START_BITRATE: "2200000"
VIDEO_MIN_BITRATE: "1200000"
VIDEO_DEGRADATION: "maintain-resolution"
VIDEO_PREFER_CODEC: "H264"
```

如果要优先流畅，可以尝试：

```yaml
VIDEO_WIDTH: "960"
VIDEO_HEIGHT: "540"
VIDEO_FPS: "18"
VIDEO_MAX_BITRATE: "1800000"
VIDEO_START_BITRATE: "1000000"
VIDEO_MIN_BITRATE: "500000"
VIDEO_DEGRADATION: "maintain-framerate"
VIDEO_PREFER_CODEC: "H264"
```

## 群晖 NAS 反代注意事项

反向代理目标地址通常是：

```text
http://127.0.0.1:3050
```

需要开启 WebSocket 支持。如果手动配置请求头，至少包含：

| Header | Value |
| --- | --- |
| `Upgrade` | `$http_upgrade` |
| `Connection` | `$connection_upgrade` |
| `X-Forwarded-For` | `$proxy_add_x_forwarded_for` |

如果 WebSocket 没有代理成功，页面通常会反复显示“连接服务器 / 服务器断开”。

## 故障排查

### 页面反复显示连接服务器和服务器断开

通常是 WebSocket 被反向代理断开。

检查：

- 反向代理是否开启 WebSocket 支持
- `Upgrade` 和 `Connection` 请求头是否正确传递
- 上游地址是否指向 RelayTalk 的 Node.js 端口
- 容器日志：`docker logs relaytalk-app`

### 摄像头或麦克风无法启动

检查：

- 手机访问是否使用 HTTPS
- 浏览器权限弹窗是否点了允许
- 摄像头或麦克风是否被其他 App 占用
- 浏览器 Console 里是否有 `getUserMedia` 错误

### 页面进入了，但音视频一直等待

通常是 WebRTC 到 TURN 的媒体通道没有建立成功。

从客户端所在网络测试：

```bash
nc -vz your-domain.example.com 3478
```

继续检查：

- `TURN_URLS` 是否包含 `?transport=tcp`
- TURN 用户名和密码是否正确
- 防火墙、安全组、路由器是否放行 TCP `3478`
- `ICE_TRANSPORT_POLICY=relay` 是否符合你的预期

### 一方在线，但收不到 offer / answer

服务端日志里应该能看到：

```text
wr-offer
wr-answer
wr-can
```

这里有一个关键经验：Node.js 的 `ws` 库可能把文本帧以 `Buffer` 对象形式交给服务端，但此时 `isBinary=false`。判断 WebSocket 消息类型时必须以 `isBinary` 为准，而不能只看 `Buffer.isBuffer(data)`，否则会把 WebRTC JSON 信令误当成二进制数据，导致通话无法建立。

### 视频能用，但画质低

提高视频码率环境变量：

```yaml
VIDEO_MAX_BITRATE: "3500000"
VIDEO_START_BITRATE: "2200000"
VIDEO_MIN_BITRATE: "1200000"
```

也可以把采集目标从 720p 调到 1080p，但 TURN TCP 会更吃带宽，跨网络使用时建议逐步提高。若页面底部出现 `Q:bandwidth`，继续提高码率通常只会更卡；此时应降低帧率或分辨率，或者改用可用的 TURN UDP / 直连路径。

## 项目结构

```text
RelayTalk/
├── server.js
├── package.json
├── Dockerfile
├── docker-compose.yml
├── docker-compose.app-only.yml
├── nginx.conf
├── public/
│   └── index.html
└── README.md
```

## License

MIT
