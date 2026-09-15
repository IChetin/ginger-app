# Общее для бэкапов: копия на Google Drive через rclone (решение Ивана 15.09).
#
# Конфиг rclone — из переменных окружения, без файла конфигурации. Токен Google кладёт Иван:
#   (Get-Clipboard -Raw).Trim() | ssh ginger "umask 077; cat > /opt/ginger/secrets/rclone-drive-token.json"
# Доступ scope=drive.file: rclone видит только файлы, которые создал сам, — остальной Drive недоступен.

TOKEN_FILE="/opt/ginger/secrets/rclone-drive-token.json"
REMOTE="gdrive:ginger-backups"

# Готов ли rclone: есть утилита и токен. Заодно выставляет конфиг удалённого хранилища.
rclone_ready() {
  if [[ ! -s "$TOKEN_FILE" ]] || ! command -v rclone >/dev/null; then
    return 1
  fi
  export RCLONE_CONFIG_GDRIVE_TYPE=drive
  export RCLONE_CONFIG_GDRIVE_SCOPE=drive.file
  RCLONE_CONFIG_GDRIVE_TOKEN="$(cat "$TOKEN_FILE")"
  export RCLONE_CONFIG_GDRIVE_TOKEN
}
