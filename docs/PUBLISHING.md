# Как открыть Мелстрой мерж по ссылке

Игра — статический сайт. Для телефона и компьютера используется одна HTTPS-ссылка.

## GitHub Pages

Репозиторий: https://github.com/k0sm0s08/meme-merge

1. Открой репозиторий и нажми **Settings → Pages**.
2. В разделе **Build and deployment** для **Source** выбери **GitHub Actions**.
3. Открой Pull Request с обновлением игры. После успешной проверки сборки нажми **Merge pull request → Confirm merge**.
4. Перейди во вкладку **Actions** и открой запуск **Build and deploy Meme Merge** для ветки `main`. Дождись зелёных галочек у `build` и `deploy`.
5. Вернись в **Settings → Pages** и нажми **Visit site**. Открой эту же ссылку на телефоне.

Ожидаемый адрес после успешной публикации:

**https://k0sm0s08.github.io/meme-merge/**

Это адрес будущей публикации; до успешного `deploy` он может отвечать 404.

Если Pages включили уже после слияния PR, зайди в **Actions → Build and deploy Meme Merge → Run workflow**, выбери **main** и нажми зелёную кнопку **Run workflow**. Ручной запуск из другой ветки не публикует сайт.

### Если автоматический Pull Request не удалось создать

После отправки рабочей ветки на GitHub открой:

https://github.com/k0sm0s08/meme-merge/compare/main...work?expand=1

Нажми **Create pull request**. Для обновления название и текст находятся в [PULL_REQUEST.md](PULL_REQUEST.md). Затем выполни шаги публикации выше.

### Что делает workflow

- Использует Node.js 24 и зависимости из `package-lock.json` (`npm ci`).
- Запускает TypeScript, production-сборку и проверку ссылок на ресурсы.
- В PR выполняет только проверку сборки.
- После обновления `main` передаёт `dist/` штатному механизму Pages и публикует сайт.
- Получает права на публикацию и OIDC только в job `deploy`; сборка имеет только права чтения.

Пользовательские ZIP-артефакты не создаются. Служебный артефакт `github-pages` нужен GitHub для самой публикации; скачивать его не надо.

## Если репозиторий приватный и Pages недоступен

GitHub Pages на тарифе GitHub Free доступен для публичных репозиториев. Для приватных репозиториев нужен поддерживающий Pages платный тариф, например GitHub Pro или Team. [Правила GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages).

Менять приватность репозитория для тестирования не требуется. Бесплатная альтернатива — **Cloudflare Pages**, поддерживающая приватные GitHub-репозитории.

1. Создай бесплатный аккаунт на https://dash.cloudflare.com/ и открой **Workers & Pages**.
2. Нажми **Create application → Pages → Connect to Git**.
3. Подключи GitHub, разреши доступ к репозиторию `meme-merge` и выбери его.
4. Выбери ветку **main** после слияния PR. Если хочешь тестировать рабочую ветку до слияния, выбери **work**.
5. В настройках сборки укажи:

   | Настройка | Значение |
   |---|---|
   | Framework preset | Vite (или None) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | оставить пустым |
   | Environment variable | `VITE_BASE_PATH` = `/` |
   | Environment variable | `NODE_VERSION` = `24` |

6. Нажми **Save and Deploy**. После успешной сборки Cloudflare покажет ссылку вида `https://имя-проекта.pages.dev`. Она открывается и на компьютере, и на телефоне.

Переменная `VITE_BASE_PATH=/` нужна для корня домена Cloudflare. В GitHub Pages сохраняется `/meme-merge/`. Ресурсы игры используют тот же base path, поэтому мемы загружаются на обоих хостингах.

[Официальная инструкция Cloudflare](https://developers.cloudflare.com/pages/get-started/git-integration/).

## Если сборка или публикация не запускаются

- Проверь, что PR слит в `main` и workflow находится в `.github/workflows/deploy-pages.yml`.
- В **Settings → Actions → General** убедись, что GitHub Actions разрешён для репозитория. Если настройка запрещена владельцем организации, потребуется его помощь.
- При ошибке **Get Pages site failed / Not Found** сначала выбери **Settings → Pages → Source → GitHub Actions**, затем повтори **Run workflow** из `main`.
- Для телефона отправляй ссылку на сайт, а не ссылку на репозиторий или служебный артефакт Actions.
