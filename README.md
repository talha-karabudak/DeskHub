# Pixoo 16 minimal Bluetooth driver

Windows 11 üzerinde eski/orijinal Divoom Pixoo 16'ya Bluetooth Classic SPP
üzerinden doğrudan paket gönderen küçük Python prototipi.

## Requirements

- Windows 11 ve çalışan bir Bluetooth adaptörü
- Python 3.9+
- Windows ile eşleştirilmiş bir Pixoo 16

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Bluetooth pairing

Windows Ayarları > Bluetooth ve cihazlar > Cihaz ekle > Bluetooth yoluyla
`Pixoo` cihazını eşleştirin. Telefon uygulamasını kapatın; cihaz aynı anda başka
bir denetleyiciye bağlıysa SPP bağlantısını reddedebilir.

## Device discovery

```powershell
Get-PnpDevice -Class Bluetooth | Where-Object FriendlyName -Match 'Pixoo|Divoom'
Get-PnpDevice -Class Ports | Format-List FriendlyName,InstanceId
Get-CimInstance Win32_SerialPort | Format-Table DeviceID,Name,PNPDeviceID
```

Pixoo adresini taşıyan `BTHENUM\\{00001101-...}` portu outgoing SPP portudur.
Bu bilgisayarda keşif sonucu `COM3` olarak doğrulandı.

## Configuration

`config.example.json` dosyasını `config.json` adıyla kopyalayın. Gerçek MAC'i
yalnızca `config.json` içinde tutun; dosya git tarafından yok sayılır.
`serial_port` değeri `auto` olduğunda outgoing SPP portu MAC adresinden bulunur;
yeniden eşleştirme COM numarasını değiştirse bile config güncellemek gerekmez.

## Run test

Önce testler:

```powershell
python -m unittest discover -v
```

Sonra zararsız brightness testi:

```powershell
python run_pixoo.py --debug brightness 30
```

Tek renk ve özel desenler:

```powershell
python run_pixoo.py pattern red
python run_pixoo.py pattern green
python run_pixoo.py pattern blue
python run_pixoo.py pattern x
```

Yerel bir PNG/JPEG dosyasını nearest-neighbor ile 16×16'ya çevirip gösterme:

```powershell
python run_pixoo.py image .\my-art.png
```

Kalıcı bağlantıyla 30 saniyelik hareketli demo:

```powershell
python run_pixoo.py demo --seconds 30 --fps 4
```

Demo `Ctrl+C` ile durdurulduğunda Bluetooth portunu temiz biçimde kapatır.

Kalıcı bağlantıyla kayan bitmap metin:

```powershell
python run_pixoo.py scroll PIXOO --seconds 30 --fps 4
```

10 dakikalık kalıcı bağlantı testi:

```powershell
python stress_test.py --duration 600 --interval 1
```

## Data flow

`Framebuffer`, 768 adet row-major RGB byte tutar (`16*16*3`). Protokol katmanı
benzersiz renklerden bir palet üretir ve her pikseli palet indeksi olarak
LSB-first bit paketler. Görüntü payload'u `0x44` komutuna eklenir. Dış paket:

`set_pixel()` tek pikseli, `fill()` tüm ekranı ve Bresenham tabanlı
`draw_line()` iki koordinat arasındaki çizgiyi framebuffer içinde oluşturur.
`draw_text()` ise dahili 3×5 bitmap fontla `A-Z`, `0-9` ve boşluk çizer;
ölçek büyütülebilir ve ekran dışına taşan pikseller kırpılır.

```text
01 | length (LE16) | command | payload | checksum (LE16) | 02
```

Checksum, başlangıç `01` byte'ı hariç `length + command + payload` byte'larının
16-bit toplamıdır. Transport bu byte dizisini Windows'un Bluetooth SPP sanal
COM portuna yazar; Windows RFCOMM bağlantısını yönetir.

`SerialTransport.reconnect()` kopmuş portu kapatıp varsayılan olarak üç kez
yeniden bağlanmayı dener ve her başarısız denemenin gerçek nedenini loglar.
`Pixoo` komut gönderimi sırasında transport hatası görürse otomatik reconnect
yapar ve aynı idempotent ekran komutunu yalnızca bir kez tekrarlar.

## Troubleshooting

- `Access is denied`: Divoom uygulamasını ve COM portunu kullanan diğer programları kapatın.
- `FileNotFoundError` / port yok: Pixoo'yu yeniden eşleştirin ve COM numarasını tekrar keşfedin.
- Timeout veya kopma: Pixoo'yu kapatıp açın ve telefon Bluetooth bağlantısını kesin.
- Bu firmware'de brightness `0` ekranı uyku/kapalı duruma geçirip SPP'yi düşürebilir;
  normal testlerde en az `1` kullanın. Yeniden açmak için fiziksel güç düğmesine kısa basın.
- Paket gönderiliyor ama tepki yok: `--debug` ile hex paketi kontrol edin; cihaz modelinin gerçekten 16x16 Bluetooth sürümü olduğunu doğrulayın.

## DeskHub bridge

Python bridge yalnızca localhost üzerinde çalışır ve Pixoo bağlantısını sürekli
açık tutar:

```powershell
python bridge.py
```

Başka bir terminalden TypeScript Milestone 2 istemcisi:

```powershell
node --experimental-strip-types .\deskhub\src\milestone2.ts
```

HTTP uçları: `GET /health`, `POST /brightness`, `POST /display/frame`,
`POST /display/text`, `POST /display/image`. Business logic ve event priority
Python bridge'e ait değildir; bunlar DeskHub TypeScript katmanında kalır.

## DeskHub iRacing integration

iRacing entegrasyonu Windows'taki yerel SDK shared-memory arayüzünü
`irsdk-node` üzerinden salt okunur. Acquisition ile business logic ayrıdır:

```text
iRacing shared memory (~60 Hz)
  -> SDKIRacingTelemetrySource (10 Hz snapshot)
  -> IRacingEventDetector (yalnızca state transition)
  -> IRacingEventAdapter
  -> mevcut priority queue
  -> localhost Pixoo bridge
```

Pixoo continuous telemetry dashboard değildir. RPM, speed ve gear her tick'te
ekrana gönderilmez. İlk sürüm idle konumu (`P7`) ile personal best, position
gained/lost, incident delta, yellow/blue flag ve finish eventlerini destekler.
Session'ın ilk snapshot'i baseline'dir; startup'ta eski PB replay edilmez.

Fake pipeline:

```powershell
cd .\deskhub
npm run iracing:fake
```

Bu demo `P7 -> PB -> P7` akışını mevcut queue ve Pixoo bridge ile oynatır.
Native SDK kontrolü ve gerçek source:

```powershell
npm run iracing:check
npm run iracing
```

Simulator kapalıyken source crash olmaz. Process'in açık olması tek başına
IRACING mode sayılmaz; aktif session için SDK connection ile
`IsOnTrack`/`IsOnTrackCar` telemetry sinyali gerekir.

Known limitations:

- Gerçek test için iRacing aynı Windows bilgisayarda aktif track session'ında olmalıdır.
- Low fuel, güvenilir fuel-laps-remaining modeli kurulana kadar ertelendi.
- Pit-cycle/session reset kaynaklı büyük position sıçramaları bastırılır.
- Queue preemption bu milestone'un parçası değildir.
