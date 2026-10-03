#!/usr/bin/env bash
# Prepara un VPS Ubuntu de Oracle Cloud para Cryptoville (se ejecuta UNA vez):
#   1. Instala Docker (repositorio oficial) y el plugin de Compose.
#   2. Abre los puertos 80 y 443 en el firewall interno (iptables) de forma persistente.
#      Oracle además tiene un firewall en la nube: abre 80 y 443 en la Security List
#      (ver docs/despliegue-vps.md, paso 1).
#   3. Crea 2 GB de swap si la máquina tiene poca memoria (para poder compilar las imágenes).
# Uso:  sudo bash deploy/setup-vps.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta con sudo:  sudo bash deploy/setup-vps.sh" >&2
  exit 1
fi
USUARIO="${SUDO_USER:-ubuntu}"

echo "==> 1/3 Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "Docker ya está instalado: $(docker --version)"
fi
usermod -aG docker "$USUARIO" || true

echo "==> 2/3 Firewall interno (iptables): puertos 80 y 443"
apt-get install -y iptables-persistent netfilter-persistent >/dev/null 2>&1 || true
abrir() {
  local proto="$1" puerto="$2"
  if ! iptables -C INPUT -p "$proto" --dport "$puerto" -j ACCEPT 2>/dev/null; then
    # Se inserta al principio para que quede antes de la regla REJECT que trae la imagen de Oracle.
    iptables -I INPUT 1 -p "$proto" --dport "$puerto" -j ACCEPT
    echo "  abierto $proto/$puerto"
  else
    echo "  $proto/$puerto ya estaba abierto"
  fi
}
abrir tcp 80
abrir tcp 443
abrir udp 443
netfilter-persistent save >/dev/null 2>&1 || iptables-save > /etc/iptables/rules.v4

echo "==> 3/3 Memoria swap"
MEMORIA_MB=$(free -m | awk '/^Mem:/ {print $2}')
if [ "$MEMORIA_MB" -lt 3000 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  swap de 2 GB creada (la máquina tiene ${MEMORIA_MB} MB de RAM)"
else
  echo "  no hace falta (RAM: ${MEMORIA_MB} MB)"
fi

IP=$(curl -fsS --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')
echo
echo "Listo. Cierra la sesión SSH y vuelve a entrar (para usar docker sin sudo)."
echo "Tu IP pública parece ser: $IP"
echo "  PUBLIC_HOST con HTTPS:  $(echo "$IP" | tr . -).sslip.io"
echo "Siguiente paso: cp .env.example .env, llénalo y ejecuta  bash deploy/deploy.sh"
