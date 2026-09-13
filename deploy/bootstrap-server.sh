#!/usr/bin/env bash
# Первичная настройка чистого Ubuntu 24.04 под Ginger APP. Запускать от root один раз:
#
#   ssh -i ~/.ssh/ginger_hostkey root@<IP> 'bash -s' < deploy/bootstrap-server.sh
#
# Что делает: пользователь ginger с ключом root, вход только по ключу и без root, фаервол
# (22, 80, 443), своп 2 ГБ, Docker из официального репозитория, ротация логов Docker,
# автообновления безопасности. Скрипт можно запускать повторно.
set -euo pipefail

DEPLOY_USER="ginger"
export DEBIAN_FRONTEND=noninteractive

echo "==> Пакеты"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades

echo "==> Пользователь ${DEPLOY_USER}"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"
echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" >"/etc/sudoers.d/90-${DEPLOY_USER}"
chmod 440 "/etc/sudoers.d/90-${DEPLOY_USER}"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/${DEPLOY_USER}/.ssh"
install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys \
  "/home/${DEPLOY_USER}/.ssh/authorized_keys"

echo "==> SSH: только ключи, без root"
cat >/etc/ssh/sshd_config.d/90-ginger.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t
systemctl reload ssh

echo "==> Фаервол"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Своп 2 ГБ"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
echo 'vm.swappiness=10' >/etc/sysctl.d/90-ginger.conf
sysctl -q --system

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$DEPLOY_USER"
cat >/etc/docker/daemon.json <<'EOF'
{"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}}
EOF
systemctl restart docker

echo "==> Автообновления безопасности"
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now fail2ban

echo "==> Каталоги"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" /opt/ginger /opt/ginger/app /opt/ginger/backups
timedatectl set-timezone UTC

echo "Готово. Проверьте вход: ssh -i ~/.ssh/ginger_hostkey ${DEPLOY_USER}@<IP> — и только потом закрывайте сессию root."
