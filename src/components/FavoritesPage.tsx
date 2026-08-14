import type { FavoriteRoute } from '../types/bus'
import { StarIcon } from './Icons'

export function FavoritesPage({
  favorites,
  onSelect,
}: {
  favorites: FavoriteRoute[]
  onSelect: (route: FavoriteRoute) => void
}) {
  if (!favorites.length) {
    return (
      <section className="empty-state compact" aria-labelledby="favorites-title">
        <div className="empty-icon favorite-empty-icon"><StarIcon /></div>
        <h2 id="favorites-title">尚未加入收藏</h2>
        <p>在路線詳情頁按星號，即可加入收藏。</p>
      </section>
    )
  }

  return (
    <section className="favorites-list" aria-label="已收藏路線">
      {favorites.map((favorite) => (
        <article className="favorite-row" key={favorite.id}>
          <button className="favorite-route-button" type="button" onClick={() => onSelect(favorite)}>
            <span className={`favorite-route-badge ${favorite.internalOperator === 'citybus' ? 'citybus' : 'kmb'}`}><strong>{favorite.route}</strong><small>{favorite.internalOperator === 'citybus' ? '城巴' : '九巴・龍運'}</small></span>
            <span className="favorite-copy"><strong>往 {favorite.destination}</strong><small>按此查看最近車站及完整路線</small></span>
            <span className="favorite-chevron" aria-hidden="true">›</span>
          </button>
        </article>
      ))}
    </section>
  )
}
