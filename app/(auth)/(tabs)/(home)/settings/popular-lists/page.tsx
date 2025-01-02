import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { Loader } from "@/components/Loader";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { Linking, Switch, View } from "react-native";

export default function page() {
  const navigation = useNavigation();

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const [settings, updateSettings] = useSettings();

  const handleOpenLink = () => {
    Linking.openURL("https://github.com/fredrikburmester/marlin-search");
  };

  const queryClient = useQueryClient();

  const {
    data: mediaListCollections,
    isLoading: isLoadingMediaListCollections,
  } = useQuery({
    queryKey: ["sf_promoted", user?.Id, settings?.usePopularPlugin],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        tags: ["sf_promoted"],
        recursive: true,
        fields: ["Tags"],
        includeItemTypes: ["BoxSet"],
      });

      return response.data.Items ?? [];
    },
    enabled: !!api && !!user?.Id && settings?.usePopularPlugin === true,
    staleTime: 0,
  });

  if (!settings) return null;

  return (
    <View className="px-4 pt-4">
      <ListGroup title={"Enable plugin"} className="mb-4">
        <ListItem
          title={"Enable Popular Lists"}
          onPress={() => {
            updateSettings({ usePopularPlugin: true });
            queryClient.invalidateQueries({ queryKey: ["search"] });
          }}
        >
          <Switch
            value={settings.usePopularPlugin}
            onValueChange={(value) => {
              updateSettings({ usePopularPlugin: value });
            }}
          />
        </ListItem>
      </ListGroup>

      {settings.usePopularPlugin && (
        <ListGroup title="Media List Collections">
          {mediaListCollections?.map((mlc) => (
            <ListItem key={mlc.Id} title={mlc.Name}>
              <Switch
                value={settings.mediaListCollectionIds?.includes(mlc.Id!)}
                onValueChange={(value) => {
                  if (!settings.mediaListCollectionIds) {
                    updateSettings({
                      mediaListCollectionIds: [mlc.Id!],
                    });
                    return;
                  }

                  updateSettings({
                    mediaListCollectionIds:
                      settings.mediaListCollectionIds.includes(mlc.Id!)
                        ? settings.mediaListCollectionIds.filter(
                            (id) => id !== mlc.Id
                          )
                        : [...settings.mediaListCollectionIds, mlc.Id!],
                  });
                }}
              />
            </ListItem>
          ))}
          {isLoadingMediaListCollections && <Loader />}
          {mediaListCollections?.length === 0 && (
            <Text className="text-xs opacity-50 p-4">
              No collections found. Add some in Jellyfin.
            </Text>
          )}
        </ListGroup>
      )}
    </View>
  );
}
