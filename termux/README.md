# Run FF MAX UNIVERSE on Termux (Android)

Phone se hi site host karo — koi server, koi internet, koi account nahi chahiye.

## 1. Termux install (ek baar)

> Play Store wala Termux purana hai. **F-Droid** ya GitHub releases se latest install karo:
> https://f-droid.org/packages/com.termux/

## 2. Repo clone (ek baar)

```bash
pkg install -y git
git clone https://github.com/sunnyprajapati1947-coder/Sunny-.git
cd Sunny-
```

## 3. Setup (ek baar)

```bash
bash termux/setup-termux.sh
```

Yeh `python` + `git` install karta hai, `termux-api` optional hai (wake-lock ke liye).

## 4. Site start

```bash
bash termux/serve.sh
```

Output me do URL aayenge:

```
This device : http://localhost:8080
Wi-Fi / LAN : http://192.168.x.x:8080
```

- **Same phone:** browser me `localhost:8080`
- **Same Wi-Fi ka dusra phone/laptop:** LAN URL
- **Stop:** `Ctrl+C`

### Background me chalana

```bash
bash termux/serve.sh --bg        # start
bash termux/serve.sh status      # chal raha hai?
bash termux/serve.sh stop        # band karo
tail -f /tmp/ffmax-server.log    # logs
```

### Options

| Command | Kaam |
| --- | --- |
| `--port 9000` | alag port (busy ho to script khud next free port le leta hai) |
| `--bg` | background process + pidfile |
| `status` / `stop` | background server manage karo |
| `--help` | usage |

## 5. Phone tips (battery / lock screen)

```bash
termux-wake-lock          # CPU ko jagaye rakho (termux-api chahiye)
termux-wake-unlock
```

- Android settings me **Termux ki battery optimization off** karo, warna screen lock pe process kill ho sakta hai.
- Termux:Boot add-on se auto-start chahiye to `~/.termux/boot/` me script daal sakte ho (repo ka `automation/install_termux_background.sh` isi pattern ko follow karta hai).

## 6. Update

```bash
cd ~/Sunny-
git pull
```

Site static hai — refresh se naya version aa jayega.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `python3 missing` | `pkg install python` |
| Port busy | `--port 9000` use karo, ya `pkill -f http.server` |
| LAN URL nahi khulta | Dono device same Wi-Fi pe hone chahiye; guest/AP isolation off karo; phone hotspot bhi chalega |
| Screen lock pe band | `termux-wake-lock` + battery optimization off |
| Fonts offline | Google Fonts CDN block ho to system font fallback ho jata hai — site phir bhi chalegi |

## Kya host ho raha hai

Script sirf `freefiremax/` folder ko serve karta hai (`--bind 0.0.0.0`), yaani local network tak. Internet pe expose **nahi** hota. Public URL chahiye to Cloudflare Tunnel / ngrok alag se chalao — lekin tab bhi yeh unofficial fan site hai, "official" ke naam pe publish mat karo (Garena trademark).
