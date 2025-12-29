import React, { useState } from 'react';
import { View, Button, Image, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import axios from 'axios';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

export default function App() {
  const [photo, setPhoto] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  // --- Take photo using device camera
  const takePhoto = async () => {
    const res = await launchCamera({ mediaType: 'photo', quality: 0.8 });
    if (res.assets && res.assets[0]) setPhoto(res.assets[0]);
  };

  // --- Pick photo from library (works on simulator)
  const chooseFromLibrary = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (res.assets && res.assets[0]) setPhoto(res.assets[0]);
  };

  // --- Send image to backend
  const classifyPhoto = async () => {
    if (!photo) return;

    const formData = new FormData();
    formData.append('file', {
      uri: photo.uri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    });

    try {
      const response = await axios.post(
        'http://127.0.0.1:8000/classify',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResult(response.data);
    } catch (err) {
      console.error(err);
      setResult({ error: 'Could not connect to backend.' });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>NutriSignal</Text>
      <View style={styles.buttonContainer}>
        <Button title="📸 Take Photo" onPress={takePhoto} />
        <View style={{ height: 10 }} />
        <Button title="🖼️ Choose from Gallery" onPress={chooseFromLibrary} />
      </View>

      {photo && <Image source={{ uri: photo.uri }} style={styles.image} />}
      
      <View style={{ marginVertical: 20 }}>
        <Button title="Classify" onPress={classifyPhoto} />
      </View>

      {result && (
        <Text style={styles.text}>
          {result.error
            ? result.error
            : `Label: ${result.label}\nSignal: ${result.signal}`}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    marginBottom: 20,
  },
  buttonContainer: {
    width: '80%',
  },
  image: {
    width: 300,
    height: 300,
    marginVertical: 20,
    borderRadius: 15,
    resizeMode: 'cover',
  },
  text: {
    marginTop: 10,
    fontSize: 18,
    textAlign: 'center',
  },
});
