## 启用代理

* 添加系统变量

```batch
set http_proxy=http://127.0.0.1:1080
set https_proxy=http://127.0.0.1:1080
```

* 设置git

```bash
git config --global http.proxy http://127.0.0.1:1080
git config --global https.proxy http://127.0.0.1:1080

git config --global core.safecrlf false
git config --global core.autocrlf true
```

