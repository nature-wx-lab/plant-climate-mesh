# 植物気候メッシュ

世界地図上で1°×1°の選択枠をクリックし、その中心点についてNASA POWERの1991–2020年気候平均を表示するNature Wx Labの公開試作ツールです。

- 公開URL: `https://nature-wx-lab.github.io/plant-climate-mesh/`
- 表示要素: 地上2m気温、補正済み降水量、全天日射量、地上2m相対湿度
- 表示値: 年平均、クリック後に開く月別グラフと数値表
- 画面: 初期表示は世界地図を全面表示し、気候データは右側の折りたたみ式ドロワーに表示
- 地図: Webメルカトル図法、Natural Earth 1:50m境界
- 地図操作: ホイールで拡大縮小、左ドラッグで移動。地点クリックでは現在の縮尺を維持。東西方向は境界なく連続移動

## データ契約

ブラウザは地点選択時だけNASA POWER Climatology APIへ問い合わせます。

```text
https://power.larc.nasa.gov/api/temporal/climatology/point
parameters=T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M
community=AG
start=1991
end=2020
format=JSON
```

選択枠は操作用の1°×1°格子です。値は選択枠全体を面積平均したものではなく、枠中心を含むPOWER元データ格子の代表値です。POWERの公表解像度は、気象要素が約0.5°×0.625°、日射要素が1°×1°です。

独自算出値を気象庁の公式な「平年値」と呼ばず、画面では「1991–2020年の気候平均」と表示します。降水量の年値はAPIの年平均日量を表示し、参考として365.25倍した年換算値も併記します。

## プライバシーとセキュリティ

- Cookie、アクセス解析、現在地取得、フォーム、アカウント機能、永続的な端末保存を使用しない
- NASA POWERへのリクエストは選択枠の中心座標だけを送り、`credentials: omit` と `referrerPolicy: no-referrer` を指定
- 外部JavaScript、外部CSS、広告タグを読み込まない
- Content Security Policyで接続先をNASA POWERだけに限定
- API応答をHTMLとして挿入せず、検証した数値だけを`textContent`で表示
- 直前のリクエストを中止し、連続クリックで古い応答が新しい地点を上書きしない
- 公開成果物を固定allowlistから組み立て、SHA-256 manifestと公開後の全ファイル照合を行う
- 公開前CIで現行ファイルと到達可能なGit履歴、author/committer identity、秘密情報らしい文字列を検査
- このローカルcloneは`.githooks/pre-push`を有効化し、GitHubへ送る前にも同じ全ファイル・全履歴検査を実行
- GitHub Secret scanningとPush protectionを有効化
- GitHub ActionsはGitHub公式Actionだけを許可し、完全なcommit SHAで固定。既定権限はreadで、pull request承認権限を与えない

地点選択時には、中心座標と通常の通信情報がNASA POWERへ送信されます。この外部送信は画面にも常時表示します。

## ローカル確認

```bash
python3 scripts/verify_contract.py
python3 scripts/privacy_gate.py
python3 -m http.server 8765
```

`http://127.0.0.1:8765/` を開きます。

## 公開

`privacy-gate.yml`はpushとpull requestで公開ファイルと全履歴を検査します。`pages.yml`は同じ検査に合格した固定allowlistだけをPages成果物にし、公開後にsource commit、全ファイルのbyte数とSHA-256、HTTPS、HSTS、404を検証します。

新しいcloneでpush前検査を有効にする場合は、repo直下で次を1回実行します。

```bash
git config core.hooksPath .githooks
```

公開用Git identityは次の2種類だけを許可します。

- `nature-wx-lab` / `nature-wx-lab@users.noreply.github.com`
- `github-actions[bot]` / `41898282+github-actions[bot]@users.noreply.github.com`

## 出典と利用条件

詳細は[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。
