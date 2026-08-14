import { useEffect, useState } from 'react'
import type { FavoriteRoute, RouteSelection } from '../types/bus'
import { FAVORITES_STORAGE_KEY, favoriteId, parseFavorites, toFavorite } from '../services/favorites'

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteRoute[]>(() => {
    if (typeof window === 'undefined') return []
    return parseFavorites(window.localStorage.getItem(FAVORITES_STORAGE_KEY))
  })

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites))
  }, [favorites])

  const isFavorite = (route: RouteSelection) => favorites.some((item) => item.id === favoriteId(route))

  const toggleFavorite = (route: RouteSelection) => {
    const id = favoriteId(route)
    setFavorites((current) => current.some((item) => item.id === id)
      ? current.filter((item) => item.id !== id)
      : [...current, toFavorite(route)])
  }

  return { favorites, isFavorite, toggleFavorite }
}
