# Промежуточный сервер («дверь» в Казахстане)

Из РФ провайдеры замораживают соединения с нашим хостером, поэтому игроки ходят через машину
другого хостера (ps.kz, `edge-kz-1`, 212.116.233.109, ssh-псевдоним `ginger-kz`). Она пересылает
TCP 80/443 в Стамбул без расшифровки: HAProxy, конфиг — [haproxy.cfg](haproxy.cfg), на сервере
`/etc/haproxy/haproxy.cfg`.

- На 443 — PROXY protocol v2 с настоящим IP игрока; Caddy в Стамбуле верит ему только с адресов
  двери (`RELAY_CIDRS`, `deploy/caddy/Caddyfile`).
- На 80 — без PROXY protocol, иначе Caddy отвечает 400 (было до 05.10.2026).

Новая дверь: Ubuntu, `apt install haproxy`, этот конфиг, `haproxy -c -f /etc/haproxy/haproxy.cfg`,
`systemctl reload haproxy`, ufw 22/80/443; её адрес — в `RELAY_CIDRS` Caddy и в DNS (Njalla).
