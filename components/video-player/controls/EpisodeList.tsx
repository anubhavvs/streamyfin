import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { runtimeTicksToSeconds } from "@/utils/time";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useState, useRef } from "react";
import { View, TouchableOpacity } from "react-native";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { Ionicons } from "@expo/vector-icons";
import { Loader } from "@/components/Loader";
import ContinueWatchingPoster from "@/components/ContinueWatchingPoster";
import { Text } from "@/components/common/Text";
import { DownloadSingleItem } from "@/components/DownloadItem";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  HorizontalScroll,
  HorizontalScrollRef,
} from "@/components/common/HorrizontalScroll";
import { router, useLocalSearchParams } from "expo-router";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getItemById } from "@/utils/jellyfin/user-library/getItemById";
import { useSettings } from "@/utils/atoms/settings";
import {
  SeasonDropdown,
  SeasonIndexState,
} from "@/components/series/SeasonDropdown";
import { Item } from "zeego/dropdown-menu";

type Props = {
  item: BaseItemDto;
  close: () => void;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

export const EpisodeList: React.FC<Props> = ({ item, close }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets(); // Get safe area insets
  const [settings] = useSettings();
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const scrollViewRef = useRef<HorizontalScrollRef>(null); // Reference to the HorizontalScroll
  const scrollToIndex = (index: number) => {
    scrollViewRef.current?.scrollToIndex(index, 100);
  };

  // Set the initial season index
  useEffect(() => {
    if (item.SeriesId) {
      setSeasonIndexState((prev) => ({
        ...prev,
        [item.SeriesId ?? ""]: item.ParentIndexNumber ?? 0,
      }));
    }
  }, []);

  const seasonIndex = seasonIndexState[item.SeriesId ?? ""];
  const [seriesItem, setSeriesItem] = useState<BaseItemDto | null>(null);

  // This effect fetches the series item data/
  useEffect(() => {
    if (item.SeriesId) {
      getUserItemData({ api, userId: user?.Id, itemId: item.SeriesId }).then(
        (res) => {
          setSeriesItem(res);
        }
      );
    }
  }, [item.SeriesId]);

  const { data: seasons } = useQuery({
    queryKey: ["seasons", item.SeriesId],
    queryFn: async () => {
      if (!api || !user?.Id || !item.SeriesId) return [];
      const response = await api.axiosInstance.get(
        `${api.basePath}/Shows/${item.SeriesId}/Seasons`,
        {
          params: {
            userId: user?.Id,
            itemId: item.SeriesId,
            Fields:
              "ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount",
          },
          headers: {
            Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
          },
        }
      );
      return response.data.Items;
    },
    enabled: !!api && !!user?.Id && !!item.SeasonId,
  });

  const selectedSeasonId: string | null = useMemo(
    () =>
      seasons?.find((season: any) => season.IndexNumber === seasonIndex)?.Id,
    [seasons, seasonIndex]
  );

  const { data: episodes, isFetching } = useQuery({
    queryKey: ["episodes", item.SeriesId, selectedSeasonId],
    queryFn: async () => {
      if (!api || !user?.Id || !item.Id || !selectedSeasonId) return [];
      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.SeriesId || "",
        userId: user.Id,
        seasonId: selectedSeasonId || undefined,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview"],
      });

      return res.data.Items;
    },
    enabled: !!api && !!user?.Id && !!selectedSeasonId,
  });

  useEffect(() => {
    if (item?.Type === "Episode" && item.Id) {
      const index = episodes?.findIndex((ep) => ep.Id === item.Id);
      if (index !== undefined && index !== -1) {
        setTimeout(() => {
          scrollToIndex(index);
        }, 400);
      }
    }
  }, [episodes, item]);

  const queryClient = useQueryClient();
  useEffect(() => {
    for (let e of episodes || []) {
      queryClient.prefetchQuery({
        queryKey: ["item", e.Id],
        queryFn: async () => {
          if (!e.Id) return;
          const res = await getUserItemData({
            api,
            userId: user?.Id,
            itemId: e.Id,
          });
          return res;
        },
        staleTime: 60 * 5 * 1000,
      });
    }
  }, [episodes]);

  // Scroll to the current item when episodes are fetched
  useEffect(() => {
    if (episodes && scrollViewRef.current) {
      const currentItemIndex = episodes.findIndex((e) => e.Id === item.Id);
      if (currentItemIndex !== -1) {
        scrollViewRef.current.scrollToIndex(currentItemIndex, 16); // Adjust the scroll position based on item width
      }
    }
  }, [episodes, item.Id]);

  const { audioIndex, subtitleIndex, bitrateValue } = useLocalSearchParams<{
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
  }>();

  const gotoEpisode = async (itemId: string) => {
    const item = await getItemById(api, itemId);
    if (!settings || !item) return;

    const { mediaSource } = getDefaultPlaySettings(item, settings);

    const queryParams = new URLSearchParams({
      itemId: item.Id ?? "", // Ensure itemId is a string
      audioIndex: audioIndex?.toString() ?? "",
      subtitleIndex: subtitleIndex?.toString() ?? "",
      mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
      bitrateValue: bitrateValue,
    }).toString();

    if (!bitrateValue) {
      // @ts-expect-error
      router.replace(`player/direct-player?${queryParams}`);
      return;
    }
    // @ts-expect-error
    router.replace(`player/transcoding-player?${queryParams}`);
  };

  return (
    <View
      style={{
        position: "absolute",
        backgroundColor: "black",
      }}
    >
      {isFetching ? (
        <View className="flex flex-col items-center justify-center">
          <Loader />
        </View>
      ) : (
        <>
          <View
            style={{
              justifyContent: "space-between",
            }}
            className={`flex flex-row items-center space-x-2 z-10 p-4`}
          >
            {seriesItem && (
              <SeasonDropdown
                item={seriesItem}
                seasons={seasons}
                state={seasonIndexState}
                onSelect={(season) => {
                  setSeasonIndexState((prev) => ({
                    ...prev,
                    [item.SeriesId ?? ""]: season.IndexNumber,
                  }));
                }}
              />
            )}
            <TouchableOpacity
              onPress={async () => {
                close();
              }}
              className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <View
            style={{
              alignSelf: "center",
            }}
          >
            <HorizontalScroll
              ref={scrollViewRef}
              data={episodes}
              extraData={item}
              renderItem={(_item, idx) => (
                <View
                  key={_item.Id}
                  style={{}}
                  className={`flex flex-col w-44 ${
                    item.Id !== _item.Id ? "opacity-75" : ""
                  }`}
                >
                  <TouchableOpacity
                    onPress={() => {
                      gotoEpisode(_item.Id);
                    }}
                  >
                    <ContinueWatchingPoster
                      item={_item}
                      useEpisodePoster
                      showPlayButton={_item.Id !== item.Id}
                    />
                  </TouchableOpacity>
                  <View className="shrink">
                    <Text
                      numberOfLines={2}
                      style={{
                        lineHeight: 18, // Adjust this value based on your text size
                        height: 36, // lineHeight * 2 for consistent two-line space
                      }}
                    >
                      {_item.Name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-xs text-neutral-475"
                    >
                      {`S${_item.ParentIndexNumber?.toString()}:E${_item.IndexNumber?.toString()}`}
                    </Text>
                    <Text className="text-xs text-neutral-500">
                      {runtimeTicksToSeconds(_item.RunTimeTicks)}
                    </Text>
                  </View>
                  <View className="self-start mt-2">
                    <DownloadSingleItem item={_item} />
                  </View>
                  <Text
                    numberOfLines={5}
                    className="text-xs text-neutral-500 shrink"
                  >
                    {_item.Overview}
                  </Text>
                </View>
              )}
              keyExtractor={(e: BaseItemDto) => e.Id ?? ""}
              estimatedItemSize={200}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        </>
      )}
    </View>
  );
};
